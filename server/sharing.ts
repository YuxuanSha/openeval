import { validateBundlePaths } from './bundle-paths.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { AppError, Store, hash, now } from './store.ts';
import { addVersion, kinds, project, text } from './domain.ts';
import { readSkillArchive } from './skill-package.ts';
import { PACKAGE_VERSION as appVersion } from './package-root.ts';

export const SHARE_FORMAT = 'openeval.share';
export const SHARE_SCHEMA = 1;
export const SHARE_MAX_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 200;
const excluded = ['credentials', 'sessions', 'messages', 'runs', 'memories', 'workspace', 'source URLs', 'unselected resources'];
type ShareEntry = { key:string; resourceKey:string; kind:string; title:string; version:number; versionLabel:string|null; createdAt:string; path:string; mime:string; sha256:string; byteSize:number; metadata:Record<string,unknown> };
export type SharePackage = { format:string; schemaVersion:number; createdAt:string; producer:{name:string;version:string}; entries:ShareEntry[]; blobs:Record<string,string>; manifestSha256:string };
const bad=(message:string)=>new AppError(400,'INVALID_SHARE',message);
function safePath(value:unknown):string {
  if(typeof value!=='string'||!value||value.length>500||/[:\\\x00-\x1f]/.test(value)||value.startsWith('/')||value.split('/').some(p=>!p||p==='.'||p==='..'))throw bad('分享包中的文件路径无效');
  return value;
}
function safeMetadata(value:any) {
  const out:Record<string,unknown>={};
  if(value?.identityFields!==undefined){if(!Array.isArray(value.identityFields)||value.identityFields.length>50||value.identityFields.some((x:unknown)=>typeof x!=='string'||!x||x.length>100))throw bad('身份字段无效');out.identityFields=value.identityFields;}
  if(value?.recordsField!==undefined){out.recordsField=text(value.recordsField,'记录字段',100);}
  if(value?.representation!==undefined){out.representation=text(value.representation,'资料完整性标记',100);}
  for(const flag of ['requiresFullSourceBeforeScoring','requiresOriginalSourcesForFormalEvaluation'])if(value?.[flag]!==undefined){if(typeof value[flag]!=='boolean')throw bad('资料完整性限制无效');out[flag]=value[flag];}
  return out;
}
// Known credential patterns are a stop signal. This is not a claim of automatic anonymization.
function credentialRisk(value:string) {
  return /(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|(?:access_token|refresh_token|api_key|client_secret|password)["']?\s*[:=]\s*["']?[^\s"',;}]{8,})/i.test(value);
}
function entryCredentialRisk(e:ShareEntry,encoded:string) {
  const bytes=Buffer.from(encoded,'base64');
  if(credentialRisk(e.title+'\n'+e.path+'\n'+bytes.toString('utf8')))return true;
  return e.kind==='skill'&&e.path.toLowerCase().endsWith('.zip')&&readSkillArchive(bytes).files.some((f:any)=>credentialRisk(f.path+'\n'+f.bytes.toString('utf8')));
}
function manifestDigest(p:Omit<SharePackage,'manifestSha256'>|SharePackage) {
  return hash(JSON.stringify({format:p.format,schemaVersion:p.schemaVersion,createdAt:p.createdAt,producer:p.producer,entries:p.entries}));
}
function uniqueIds(value:any,name:string) {if(!Array.isArray(value)||value.length>MAX_ENTRIES||value.some(x=>typeof x!=='string'||!x||x.length>200)||new Set(value).size!==value.length)throw bad(`${name}无效或重复`);return value as string[];}

/** Export only explicitly selected snapshots and files; never traverse the workspace or fetch links. */
export function exportShare(store:Store,input:any):SharePackage {
  project(store,input.projectId);
  const versionIds=uniqueIds(input.versionIds??[],'快照列表');const artifactIds=uniqueIds(input.artifactIds??[],'附件列表');
  if(!versionIds.length&&!artifactIds.length)throw bad('请选择要分享的资料或产物');
  if(versionIds.length+artifactIds.length>MAX_ENTRIES)throw bad('分享包最多包含 200 个文件');
  const entries:ShareEntry[]=[];const blobs:Record<string,string>={};let size=0;
  const append=(entry:ShareEntry,bytes:Buffer)=>{
    if(entries.length>=MAX_ENTRIES)throw new AppError(413,'SHARE_SIZE','分享包最多包含 200 个文件（含 Skill 附件）');
    if(entries.some(e=>e.path===entry.path&&e.sha256!==entry.sha256))throw bad('存在同路径的不同文件，请分别导出不同版本');
    if(hash(bytes)!==entry.sha256)throw new AppError(409,'SHARE_INTEGRITY','本地文件校验失败，无法导出');
    if(entryCredentialRisk(entry,bytes.toString('base64')))throw new AppError(409,'SHARE_CREDENTIAL','选定内容含凭据模式，请先移除凭据再分享');
    if(!Object.hasOwn(blobs,entry.sha256)){size+=bytes.length;if(size>SHARE_MAX_BYTES)throw new AppError(413,'SHARE_SIZE','分享包原始文件总量不能超过 32 MB');blobs[entry.sha256]=bytes.toString('base64');}
    entries.push(entry);
  };
  for(const key of versionIds){
    const v=store.get('versions',key);if(v.projectId!==input.projectId&&v.source.type!=='builtin')throw new AppError(403,'PROJECT_SCOPE','不能分享其他项目的资料');
    const artifact=v.metadata.artifactId?store.get('artifacts',v.metadata.artifactId,false):null;
    const bundled=v.kind==='skill'&&Array.isArray(v.metadata.bundleFiles)&&!v.source.name?.toLowerCase().endsWith('.zip');
    const path=safePath(bundled?`skills/${v.id}/SKILL.md`:artifact?.name??v.metadata.share?.path??v.source.name??`${v.id}.txt`);
    const entry:ShareEntry={key:v.id,resourceKey:v.resourceId,kind:v.kind,title:v.title,version:v.metadata.share?.originalVersion??v.version,versionLabel:v.versionLabel??null,createdAt:v.metadata.share?.originalCreatedAt??v.createdAt,path,mime:v.mime,sha256:v.hash,byteSize:v.byteSize,metadata:safeMetadata(v.metadata)};
    append(entry,store.blobBytes(v.hash));
    if(bundled){
      const files=[{path:'SKILL.md',key:v.id}];
      for(const f of v.metadata.bundleFiles){safePath(f.path);if(f.path==='SKILL.md'){if(f.hash!==v.hash)throw bad('Skill 主文件与附件清单不一致');continue;}const bytes=store.blobBytes(f.hash);const key=`skill:${v.id}:${hash(f.path).slice(0,32)}`;files.push({path:f.path,key});append({key,resourceKey:key,kind:'reference',title:posix.basename(f.path),version:1,versionLabel:null,createdAt:v.createdAt,path:`skills/${v.id}/${f.path}`,mime:'application/octet-stream',sha256:f.hash,byteSize:bytes.length,metadata:{}},bytes);}
      entry.metadata.skillFiles=files;
    }
  }
  for(const key of artifactIds){
    const a=store.get('artifacts',key);const task=store.get('tasks',a.taskId);if(task.projectId!==input.projectId)throw new AppError(403,'PROJECT_SCOPE','不能分享其他项目的产物');
    if(entries.some(e=>e.path===a.name&&e.sha256===a.hash))continue;
    append({key:`artifact:${a.id}`,resourceKey:`artifact:${a.id}`,kind:'reference',title:a.title??posix.basename(a.name),version:1,versionLabel:null,createdAt:a.createdAt,path:safePath(a.name),mime:a.mime,sha256:a.hash,byteSize:a.byteSize,metadata:{}},store.blobBytes(a.hash));
  }
  const pkg={format:SHARE_FORMAT,schemaVersion:SHARE_SCHEMA,createdAt:now(),producer:{name:'OpenEval',version:appVersion},entries,blobs,manifestSha256:''};pkg.manifestSha256=manifestDigest(pkg);validateShare(pkg);return pkg;
}

export function validateShare(value:any):SharePackage {
  if(!value||value.format!==SHARE_FORMAT||value.schemaVersion!==SHARE_SCHEMA)throw bad('不支持的 OpenEval 分享包版本');
  if(Object.keys(value).sort().join(',')!=='blobs,createdAt,entries,format,manifestSha256,producer,schemaVersion')throw bad('分享包含未知字段');
  if(typeof value.createdAt!=='string'||Number.isNaN(Date.parse(value.createdAt))||value.producer?.name!=='OpenEval'||Object.keys(value.producer).sort().join(',')!=='name,version'||typeof value.producer?.version!=='string'||value.producer.version.length>60)throw bad('分享包信息无效');
  if(!Array.isArray(value.entries)||!value.entries.length||value.entries.length>MAX_ENTRIES||!value.blobs||typeof value.blobs!=='object'||Array.isArray(value.blobs)||Object.keys(value.blobs).length>MAX_ENTRIES)throw bad('分享包文件清单无效');
  const keys=new Set<string>();const paths=new Map<string,string>();const hashes=new Set<string>();let size=0;
  for(const e of value.entries){
    if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).sort().join(',')!=='byteSize,createdAt,key,kind,metadata,mime,path,resourceKey,sha256,title,version,versionLabel')throw bad('分享包文件信息无效');
    for(const field of ['key','resourceKey'])if(typeof e[field]!=='string'||!e[field]||e[field].length>200)throw bad('文件标识无效');
    if(keys.has(e.key))throw bad('文件标识重复');keys.add(e.key);safePath(e.path);
    if(paths.has(e.path)&&paths.get(e.path)!==e.sha256)throw bad('文件路径冲突');paths.set(e.path,e.sha256);
    if(!kinds.includes(e.kind)||typeof e.title!=='string'||!e.title.trim()||e.title.length>300||!Number.isSafeInteger(e.version)||e.version<1||typeof e.createdAt!=='string'||Number.isNaN(Date.parse(e.createdAt)))throw bad('资料版本信息无效');
    if(e.versionLabel!==null&&(typeof e.versionLabel!=='string'||e.versionLabel.length>200))throw bad('版本标签无效');
    if(typeof e.mime!=='string'||! /^[\w.+-]+\/[\w.+-]+$/.test(e.mime)||typeof e.sha256!=='string'||!/^[a-f0-9]{64}$/.test(e.sha256)||!Number.isSafeInteger(e.byteSize)||e.byteSize<1||e.byteSize>SHARE_MAX_BYTES)throw bad('文件摘要或大小无效');
    if(!e.metadata||typeof e.metadata!=='object'||Array.isArray(e.metadata)||Object.keys(e.metadata).some(k=>!['identityFields','recordsField','skillFiles','representation','requiresFullSourceBeforeScoring','requiresOriginalSourcesForFormalEvaluation'].includes(k)))throw bad('分享包包含不允许的元数据');safeMetadata(e.metadata);
    const encoded=value.blobs[e.sha256];if(typeof encoded!=='string'||encoded.length>Math.ceil(SHARE_MAX_BYTES/3)*4||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw bad('文件编码无效');
    const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded||bytes.length!==e.byteSize||hash(bytes)!==e.sha256)throw bad('文件校验失败：内容与摘要不一致');
    if(!hashes.has(e.sha256)){size+=bytes.length;hashes.add(e.sha256);if(size>SHARE_MAX_BYTES)throw new AppError(413,'SHARE_SIZE','分享包超过 32 MB');}
  }
  for(const e of value.entries){if(e.metadata.skillFiles!==undefined){const files=e.metadata.skillFiles;if(e.kind!=='skill'||!Array.isArray(files)||!files.length||files.length>MAX_ENTRIES)throw bad('Skill 附件清单无效');validateBundlePaths(files.map((f:any)=>f.path));const seen=new Set();for(const f of files){if(!f||Object.keys(f).sort().join(',')!=='key,path')throw bad('Skill 附件无效');safePath(f.path);if(seen.has(f.path))throw bad('Skill 附件路径重复');seen.add(f.path);const child=value.entries.find((x:any)=>x.key===f.key);if(!child||child.path!==posix.join(posix.dirname(e.path),f.path))throw bad('Skill 附件未包含在文件清单中');}if(!files.some((f:any)=>f.path==='SKILL.md'&&f.key===e.key))throw bad('Skill 附件清单缺少主文件');}}
  if(Object.keys(value.blobs).some(k=>!hashes.has(k)))throw bad('分享包包含清单之外的文件');
  if(manifestDigest(value)!==value.manifestSha256)throw bad('分享包清单校验失败');
  return value;
}

export function inspectShare(value:any) {
  const p=validateShare(value);
  return {format:p.format,schemaVersion:p.schemaVersion,producer:p.producer,manifestSha256:p.manifestSha256,entries:p.entries.map(({metadata,...e})=>e),totalBytes:Object.values(p.blobs).reduce((n,v)=>n+Buffer.from(v,'base64').length,0),excluded, warnings:['分享包没有加密。所选文件的正文、图片和内部链接会原样包含；发送前请人工检查。','摘要只能检测损坏，不能证明发送者身份。导入不会执行 Skill、启动模型或获取远程链接。'],credentialRisk:p.entries.some(e=>entryCredentialRisk(e,p.blobs[e.sha256]))};
}

/** Validate and parse in an isolated staging store, then commit all versions/records atomically. */
export function importShare(store:Store,input:any) {
  project(store,input.projectId);const p=validateShare(input.package);const preview=inspectShare(p);
  if(preview.credentialRisk)throw new AppError(409,'SHARE_CREDENTIAL','分享包含凭据模式，请发送者移除后重试');
  const dir=mkdtempSync(join(tmpdir(),'openeval-share-'));const staging=new Store(dir);
  try {
    const groups=new Map<string,string>();const mapping:Record<string,string>={};const created:any[]=[];
    for(const e of [...p.entries].sort((a,b)=>a.version-b.version)){
      const previous=groups.get(e.resourceKey);if(previous&&created.find(v=>v.resourceId===previous)?.kind!==e.kind)throw bad('同一资料不能包含不同类型');
      const v=addVersion(staging,{projectId:'default',kind:e.kind,title:e.title,versionLabel:e.versionLabel,contentBase64:p.blobs[e.sha256],fileName:posix.basename(e.path),mime:e.mime,metadata:safeMetadata(e.metadata)},previous);
      groups.set(e.resourceKey,v.resourceId);mapping[e.key]=v.id;v.projectId=input.projectId;
      v.metadata.share={manifestSha256:p.manifestSha256,path:e.path,originalVersion:e.version,originalCreatedAt:e.createdAt,originalKey:e.key};created.push(v);
    }
    for(const e of p.entries){if(e.metadata.skillFiles){const v=created.find(v=>v.id===mapping[e.key]);v.metadata.bundleFiles=(e.metadata.skillFiles as any[]).map(f=>({path:f.path,hash:p.entries.find(x=>x.key===f.key)!.sha256}));v.metadata.bundleHash=hash(JSON.stringify(v.metadata.bundleFiles));v.metadata.packageValidated=true;}}
    const assets=Object.fromEntries(p.entries.map(e=>[e.path,{versionId:mapping[e.key],sha256:e.sha256,mime:e.mime}]));
    store.transaction(()=>{for(const v of created){v.metadata.share.assets=assets;store.blob(staging.blobBytes(v.hash));if(v.metadata.bundleFiles)for(const f of v.metadata.bundleFiles)store.blob(staging.blobBytes(f.hash));store.insert('versions',v,input.projectId);store.saveRecords(v.id,staging.iterateRecords(v.id));}});
    return {imported:created.length,versionIds:created.map(v=>v.id),mapping,manifestSha256:p.manifestSha256,executionPerformed:false};
  } finally {staging.close();rmSync(dir,{recursive:true,force:true});}
}

/** Resolve only imported companion raster images; never fetch URL or local filesystem paths. */
export function shareImage(store:Store,versionId:string,path:string) {
  const v=store.get('versions',versionId);if(!v.metadata.share)throw new AppError(404,'NOT_FOUND','没有分享包图片');
  if(!path||/[\\:\x00-\x1f]/.test(path)||path.startsWith('/'))throw bad('图片路径无效');
  const target=posix.normalize(posix.join(posix.dirname(v.metadata.share.path),path));safePath(target);
  const entry=v.metadata.share.assets?.[target];if(!entry)throw new AppError(404,'NOT_FOUND','图片未包含在分享包中');
  const bytes=store.blobBytes(entry.sha256);let mime='';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
  else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
  else if(/^GIF8[79]a$/.test(bytes.subarray(0,6).toString()))mime='image/gif';
  else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')mime='image/webp';
  if(!mime)throw new AppError(415,'SHARE_IMAGE','仅预览包内的 PNG、JPEG、GIF、WebP 图片');
  return {bytes,mime};
}

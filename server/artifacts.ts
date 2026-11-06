import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';
import { Store, id, now, hash } from './store.ts';
import { addVersion } from './domain.ts';

const labels:Record<string,string>={standard:'评测标准',dataset:'评测集',artifact_batch:'被评产物',scoring_batch:'评分结果',analysis:'分析记录',report:'评测报告',template:'报告模板',reference:'参考资料'};
export function allowedArtifactKinds(intent:string):string[]{const permitted:Record<string,string[]>={standard:['standard','reference'],dataset:['dataset','artifact_batch','reference'],evaluate:['scoring_batch','analysis','report','reference'],analyze:['analysis','report','reference'],report:['report','analysis','reference']};return permitted[intent]??Object.keys(labels).filter(kind=>kind!=='scoring_batch');}
export const mimeFor=(name:string)=>({'.html':'text/html','.md':'text/markdown','.json':'application/json','.jsonl':'application/x-ndjson','.csv':'text/csv','.tsv':'text/tab-separated-values','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.pdf':'application/pdf','.txt':'text/plain'}[extname(name).toLowerCase()]??'application/octet-stream');
function files(root:string){if(existsSync(root)&&lstatSync(root).isSymbolicLink())throw new Error('产物目录不能是符号链接');const out=new Map<string,{bytes:Buffer,hash:string}>();const walk=(dir:string)=>{if(!existsSync(dir))return;for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isSymbolicLink())continue;if(item.isDirectory()){walk(path);continue;}const stat=lstatSync(path);if(!stat.isFile()||stat.size>40*1024*1024)continue;const bytes=readFileSync(path);out.set(relative(root,path),{bytes,hash:hash(bytes)});}};walk(root);return out;}
export function outputSnapshot(cwd:string){return Object.fromEntries([...files(join(cwd,'outputs'))].map(([name,file])=>[name,file.hash]));}
export function harnessContext(store:Store,task:any,run:any,contract:any){return {name:'OpenEval',schemaVersion:1,projectId:task.projectId,taskId:task.id,runId:run.id,contractId:contract.id,refs:contract.refs,outputDirectory:`outputs/${run.id}`,manifestPath:`outputs/${run.id}/manifest.json`,allowedKinds:allowedArtifactKinds(contract.intent),existingGeneratedResources:store.list('versions',task.projectId).filter(v=>v.metadata.taskId===task.id).map(v=>({resourceId:v.resourceId,versionId:v.id,kind:v.kind,title:v.title,version:v.version,logicalKey:v.metadata.logicalKey})),manifestSchema:{artifacts:[{path:'filename relative to manifest directory',kind:'standard|dataset|artifact_batch|scoring_batch|analysis|report|template|reference',title:'user requested name takes precedence; omit for stable default',key:'stable logical key within this task',resourceId:'optional existing resource',baseVersionId:'required when resourceId is supplied',versionLabel:'optional',metadata:{identityFields:['caseId'],recordsField:'records (recommended for structured JSON batches)'}}]}};}

/** Retain byte snapshots first; register only validated explicit descriptors. Safe to retry. */
export function collectOutputs(store:Store,task:any,run:any,cwd:string,emit:(kind:string,data:any)=>void){
 run=store.get('runs',run.id,false)??run;
 const current=files(join(cwd,'outputs'));const before:Record<string,string>=run.outputBefore??{};const contract=store.get('contracts',run.contractId);const previous=store.list('artifacts',task.id);const changed=new Map([...current].filter(([name,file])=>before[name]!==file.hash));
 const manifests=[...changed].filter(([name])=>basename(name)==='manifest.json');const descriptors=new Map<string,any>();const errors:string[]=[];const badPaths=new Set<string>();const logicalKeys=new Set<string>();
 const fail=(message:string)=>{errors.push(message);emit('error',{code:'ARCHIVE_FAILED',message});};
 if(run.inputIntegrityError)fail(run.inputIntegrityError);
 for(const [manifestPath,file] of manifests){
  try{const manifest=JSON.parse(file.bytes.toString());if(!Array.isArray(manifest.artifacts))throw new Error('artifacts 必须是数组');
   for(const item of manifest.artifacts){
    if(!item||typeof item.path!=='string'||!item.path||item.path.startsWith('/')||item.path.includes('\\')||item.path.split('/').some((p:string)=>p==='..'||p==='.'||!p))throw new Error('产物路径不合法');
    const directory=manifestPath.includes('/')?manifestPath.slice(0,manifestPath.lastIndexOf('/')+1):'';
    const name=item.path.startsWith('outputs/')?item.path.slice(8):directory+item.path;
    if(descriptors.has(name)){badPaths.add(name);throw new Error(`产物路径重复：${name}`);}
    descriptors.set(name,item);
   }
  }catch(error){fail(`产物清单 ${manifestPath} 无效：${(error as Error).message}`);}
 }
 let saved=0,registered=0;const captured=new Map<string,any>();
 for(const [name,file] of changed){if(basename(name)==='manifest.json')continue;const prior=previous.find(a=>a.runId===run.id&&a.name===name&&a.hash===file.hash);const artifact=prior??{id:id(),taskId:task.id,runId:run.id,name,mime:mimeFor(name),byteSize:file.bytes.length,hash:store.blob(file.bytes),createdAt:now(),url:'',registrationStatus:'unregistered'};artifact.url=`/api/artifacts/${artifact.id}/download`;if(!prior)store.insert('artifacts',artifact,task.id);captured.set(name,artifact);saved++;}
 for(const [name,item] of descriptors){
  let artifact=captured.get(name);
  try{
   if(run.inputIntegrityError)throw new Error(run.inputIntegrityError);
   if(badPaths.has(name))throw new Error('清单中同一路径出现多次');
   if(!current.has(name))throw new Error('产物文件不存在、是符号链接或超出大小限制');
   if(!Object.hasOwn(labels,item.kind))throw new Error('产物类型无效');
   if(!artifact){const existing=previous.find(a=>a.name===name&&a.hash===current.get(name)!.hash);if(existing?.registrationStatus==='registered'){if(existing.kind!==item.kind)throw new Error('既有产物类型与清单不一致');continue;}if(!existing)throw new Error('清单引用的文件不属于本次新产物');artifact={...existing,id:id(),runId:run.id,createdAt:now(),registrationStatus:'unregistered',registrationError:null};artifact.url=`/api/artifacts/${artifact.id}/download`;store.insert('artifacts',artifact,task.id);captured.set(name,artifact);saved++;}
   if(!Object.hasOwn(labels,item.kind))throw new Error('产物类型无效');
   if(!allowedArtifactKinds(contract.intent).includes(item.kind))throw new Error('当前任务不允许登记此类型；请明确切换任务类型后继续');
   if(item.kind==='scoring_batch'&&contract.intent!=='evaluate')throw new Error('只有明确评测任务可以登记新评分批次');
   if(contract.intent==='analyze'&&!['analysis','report','reference'].includes(item.kind))throw new Error('已有结果分析只允许分析、报告和证据资料');
   const logicalKey=typeof item.key==='string'&&item.key.trim()?item.key.trim():`${item.kind}:${name.replace(new RegExp(`^${run.id}/`),'')}`;
   if(logicalKey.length>200||logicalKeys.has(logicalKey))throw new Error('同一清单的逻辑名称重复或过长');logicalKeys.add(logicalKey);
   if(artifact.registrationStatus==='registered'){registered++;continue;}
   let priorVersion:any=null;
   if(item.resourceId){const rows=store.list('versions',task.projectId).filter(v=>v.resourceId===item.resourceId);priorVersion=rows.at(-1);if(!priorVersion||priorVersion.kind!==item.kind)throw new Error('更新目标不在当前项目或类型不一致');if(!item.baseVersionId||item.baseVersionId!==priorVersion.id)throw new Error('更新目标版本已变化，请读取最新版本后重试');if(priorVersion.metadata.taskId!==task.id&&!contract.refs.some((r:any)=>store.get('versions',r.versionId).resourceId===item.resourceId))throw new Error('更新目标未被本任务引用');}
   else priorVersion=store.list('versions',task.projectId).filter(v=>v.kind===item.kind&&v.metadata.taskId===task.id&&v.metadata.logicalKey===logicalKey).at(-1);
   const title=item.title??priorVersion?.title??`${labels[item.kind]} · ${basename(name,extname(name))} · ${task.id.slice(0,8)}`;
   if(typeof title!=='string'||/(?:sk-[A-Za-z0-9_-]{16,}|(?:api_key|password|access_token)\s*[:=])/i.test(title))throw new Error('产物名称无效或含凭据模式');
   const version=store.list('versions',task.projectId).find(v=>v.metadata.artifactId===artifact.id)??addVersion(store,{projectId:task.projectId,kind:item.kind,title,versionLabel:item.versionLabel,contentBase64:current.get(name)!.bytes.toString('base64'),fileName:basename(name),mime:artifact.mime,metadata:{...(item.metadata&&typeof item.metadata==='object'&&!Array.isArray(item.metadata)?item.metadata:{}),taskId:task.id,runId:run.id,contractId:run.contractId,artifactId:artifact.id,logicalKey,refs:contract.refs,templateVersionIds:contract.refs.filter((r:any)=>store.get('versions',r.versionId).kind==='template').map((r:any)=>r.versionId),previousVersionId:priorVersion?.id??null}},priorVersion?.resourceId,{type:'generated',name:basename(name)});
   artifact={...artifact,title:version.title,kind:version.kind,resourceId:version.resourceId,versionId:version.id,version:version.version,registrationStatus:'registered',registrationError:null};store.put('artifacts',artifact,task.id);captured.set(name,artifact);registered++;emit('resource.registered',{artifactId:artifact.id,resourceId:version.resourceId,versionId:version.id,kind:version.kind,title:version.title,version:version.version});
  }catch(error){const message=`产物 ${name} 已保存但登记失败：${(error as Error).message}`;if(artifact){artifact={...artifact,registrationStatus:'failed',registrationError:message};store.put('artifacts',artifact,task.id);captured.set(name,artifact);}fail(message);}
 }
 if(!manifests.length&&saved&&['standard','dataset','evaluate','report'].includes(contract.intent))fail('交付文件缺少产物清单，尚未登记到资料库。可继续任务补写 manifest.json。');
 for(const artifact of captured.values())emit('artifact',artifact);
 const summary={saved,registered,errors};store.put('runs',{...run,archive:summary},task.id);return summary;
}

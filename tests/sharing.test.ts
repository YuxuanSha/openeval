import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, hash } from '../server/store.ts';
import { addVersion, createTask, compileContract, resolveRefs } from '../server/domain.ts';
import { exportShare, inspectShare, importShare, shareImage } from '../server/sharing.ts';
import { createApp } from '../server/index.ts';
import { seedAssets } from '../server/assets.ts';
import { packageImageURL } from '../web/src/lib/package-image.ts';

function setup(t:any){const root=mkdtempSync(join(tmpdir(),'openeval-sharing-test-'));const a=new Store(join(root,'sender'));const b=new Store(join(root,'receiver'));t.after(()=>{a.close();b.close();rmSync(root,{recursive:true,force:true});});return {a,b};}
function resource(store:Store,more:any={}){return addVersion(store,{projectId:'default',kind:'standard',title:'Synthetic rule',text:'Use original evidence.',fileName:'rule.md',mime:'text/markdown',...more});}
function resign(p:any){p.manifestSha256=hash(JSON.stringify({format:p.format,schemaVersion:p.schemaVersion,createdAt:p.createdAt,producer:p.producer,entries:p.entries}));return p;}
function packageFor(a:Store,version:any){return exportShare(a,{projectId:'default',versionIds:[version.id]});}

test('portable snapshots retain bytes, labels, rows and provenance without sessions or arbitrary metadata',t=>{
  const {a,b}=setup(t);const v=resource(a,{kind:'dataset',title:'Synthetic cases',fileName:'cases.json',mime:'application/json',text:JSON.stringify([{caseId:'a',score:2}]),versionLabel:'Revision A',metadata:{identityFields:['caseId'],privateNote:'sender-only',url:'https://private.invalid'}});
  a.put('memories',{id:'personal',content:'private memory'},'default');const p=packageFor(a,v);assert.equal(JSON.stringify(p).includes('private memory'),false);assert.equal(JSON.stringify(p).includes('sender-only'),false);assert.equal(JSON.stringify(p).includes('private.invalid'),false);
  const result=importShare(b,{projectId:'default',package:p});const copy=b.get('versions',result.versionIds[0]);assert.notEqual(copy.id,v.id);assert.notEqual(copy.resourceId,v.resourceId);assert.equal(copy.hash,v.hash);assert.equal(copy.versionLabel,'Revision A');assert.equal(copy.metadata.share.originalVersion,1);assert.equal(b.records(copy.id)[0].raw.score,2);assert.equal(result.executionPerformed,false);assert.equal(b.list('tasks').length,0);
  assert.equal(importShare(b,{projectId:'default',package:p}).imported,1);assert.equal(b.list('versions').length,2);
});
test('report and selected image survive another data directory and resolve only package images',t=>{
  const {a,b}=setup(t);const task=createTask(a,{projectId:'default'});const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL9sAAAAASUVORK5CYII=','base64');
  const r=resource(a,{kind:'report',fileName:'report.md',text:'# Report\n![Evidence](image%20one.png)',metadata:{}});
  a.put('artifacts',{id:'report-art',taskId:task.id,name:'run/report.md',hash:r.hash,mime:r.mime,byteSize:r.byteSize,createdAt:r.createdAt},task.id);r.metadata.artifactId='report-art';a.put('versions',r,'default');
  a.put('artifacts',{id:'image-art',taskId:task.id,name:'run/image one.png',hash:a.blob(png),mime:'image/png',byteSize:png.length,createdAt:r.createdAt},task.id);
  const p=exportShare(a,{projectId:'default',versionIds:[r.id],artifactIds:['image-art']});const result=importShare(b,{projectId:'default',package:p});const imageURL=packageImageURL(`/api/versions/${result.mapping[r.id]}/download`,'image%20one.png');assert.ok(imageURL);const img=shareImage(b,result.mapping[r.id],new URL(imageURL,'http://localhost').searchParams.get('path')!);assert.equal(img.mime,'image/png');assert.deepEqual(img.bytes,png);assert.throws(()=>shareImage(b,result.mapping[r.id],'../../secrets'));assert.throws(()=>shareImage(b,result.mapping[r.id],'https://example.invalid/a.png'));assert.throws(()=>shareImage(b,result.mapping[r.id],'missing.png'));
});
test('tampering, unsupported schema, hidden blobs and unsafe paths fail before writes',t=>{
  const {a,b}=setup(t);const p=packageFor(a,resource(a));const mutations=[(x:any)=>{x.schemaVersion=2;},(x:any)=>{x.blobs[x.entries[0].sha256]=Buffer.from('changed').toString('base64');},(x:any)=>{x.entries[0].title='Changed';},(x:any)=>{x.entries[0].path='../outside';resign(x);},(x:any)=>{x.blobs[hash('hidden')]=Buffer.from('hidden').toString('base64');},(x:any)=>{x.entries[0].metadata={enabled:true};resign(x);}];
  for(const mutate of mutations){const x=structuredClone(p);mutate(x);assert.throws(()=>importShare(b,{projectId:'default',package:x}));assert.equal(b.list('versions').length,0);}
});
test('invalid later dataset rolls back the entire import',t=>{
  const {a,b}=setup(t);const one=resource(a),two=resource(a,{title:'Second',fileName:'second.md',text:'invalid json'});const p=exportShare(a,{projectId:'default',versionIds:[one.id,two.id]});p.entries[1].kind='dataset';resign(p);assert.throws(()=>importShare(b,{projectId:'default',package:p}));assert.equal(b.list('versions').length,0);
});
test('cross-project files and ambiguous same-path revisions cannot be exported',t=>{
  const {a}=setup(t);a.insert('projects',{id:'other',name:'Other'},'other');const other=resource(a,{projectId:'other'});assert.throws(()=>packageFor(a,other),/其他项目/);const one=resource(a),two=addVersion(a,{text:'Revised',fileName:'rule.md'},one.resourceId);assert.throws(()=>exportShare(a,{projectId:'default',versionIds:[one.id,two.id]}),/同路径/);assert.throws(()=>exportShare(a,{projectId:'default',versionIds:[one.id,one.id]}),/重复/);
});
test('known secrets block export; import never enables a supplied skill',t=>{
  const {a,b}=setup(t);assert.throws(()=>packageFor(a,resource(a,{text:'sk-'+'x'.repeat(40)})),/凭据/);const skill=resource(a,{kind:'skill',title:'Synthetic skill',fileName:'SKILL.md',text:'---\nname: harmless\ndescription: synthetic\n---\nRead evidence.'});const result=importShare(b,{projectId:'default',package:packageFor(a,skill)});assert.equal(b.get('versions',result.versionIds[0]).metadata.enabled,false);
});
test('corrupt source bytes cannot be silently exported with an old digest',t=>{
  const {a}=setup(t);const v=resource(a);v.hash=hash('missing blob');a.put('versions',v,'default');assert.throws(()=>packageFor(a,v));
});
test('built-in skill attachments survive sharing and re-export without enabling execution',t=>{
  const {a,b}=setup(t);seedAssets(a,join(import.meta.dirname,'..'));const skill=a.list('versions').find(v=>v.kind==='skill');const p=packageFor(a,skill);assert.equal(p.entries.length,skill.metadata.bundleFiles.length);const result=importShare(b,{projectId:'default',package:p});const copy=b.get('versions',result.mapping[skill.id]);assert.equal(copy.metadata.enabled,false);assert.equal(copy.metadata.bundleFiles.length,skill.metadata.bundleFiles.length);for(const f of copy.metadata.bundleFiles)assert.deepEqual(b.blobBytes(f.hash),a.blobBytes(skill.metadata.bundleFiles.find((x:any)=>x.path===f.path).hash));const again=packageFor(b,copy);assert.equal(again.entries.length,p.entries.length);assert.equal(inspectShare(again).credentialRisk,false);
});
test('HTTP share routes inspect without importing and preserve origin checks',async t=>{
  const root=mkdtempSync(join(tmpdir(),'openeval-sharing-http-'));const app=createApp(root);t.after(async()=>{await app.close();rmSync(root,{recursive:true,force:true});});await new Promise<void>((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});const base=`http://127.0.0.1:${(app.server.address() as any).port}`;
  const call=(path:string,body:any,headers:any={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const v=resource(app.store);const res=await call('/api/shares/export',{projectId:'default',versionIds:[v.id]});assert.equal(res.status,200);const p=await res.json();const count=app.store.list('versions').length;
  assert.equal((await call('/api/shares/inspect',{package:p})).status,200);assert.equal(app.store.list('versions').length,count);assert.equal((await call('/api/shares/import',{projectId:'default',package:p},{Origin:'https://example.invalid'})).status,403);const imported=await call('/api/shares/import',{projectId:'default',package:p});assert.equal(imported.status,201);assert.equal(app.store.list('versions').length,count+1);
});


test('editing an imported resource creates a new identity; input cannot forge package asset maps',t=>{
 const {a,b}=setup(t);const original=resource(a,{versionLabel:'Original v1'});const imported=importShare(b,{projectId:'default',package:packageFor(a,original)});const first=b.get('versions',imported.mapping[original.id]);
 const second=addVersion(b,{text:'New complete rule',fileName:'new.md',metadata:{share:first.metadata.share}},first.resourceId);
 assert.equal(second.version,2);assert.equal(second.metadata.share,undefined);assert.equal(first.metadata.share.originalKey,original.id);
 const entry=packageFor(b,second).entries[0];assert.equal(entry.version,2);assert.equal(entry.path,'new.md');assert.equal(entry.createdAt,second.createdAt);assert.equal(entry.key,second.id);assert.equal(entry.versionLabel,null);
 const forged=resource(b,{metadata:{share:{path:'forged.md',assets:{'secret.png':{sha256:original.hash}}}}});assert.equal(forged.metadata.share,undefined);assert.throws(()=>shareImage(b,forged.id,'secret.png'));
});

test('summary-only evaluation restrictions survive sharing without leaking unrelated metadata',t=>{
 const {a,b}=setup(t);const source=resource(a,{metadata:{representation:'historical_summary',requiresFullSourceBeforeScoring:true,requiresOriginalSourcesForFormalEvaluation:true,privateNote:'sender-only'}});
 const p=packageFor(a,source);const result=importShare(b,{projectId:'default',package:p});const copy=b.get('versions',result.mapping[source.id]);
 assert.equal(copy.metadata.representation,'historical_summary');assert.equal(copy.metadata.requiresFullSourceBeforeScoring,true);assert.equal(copy.metadata.requiresOriginalSourcesForFormalEvaluation,true);assert.equal(copy.metadata.privateNote,undefined);
 const evidence=resource(b,{kind:'reference',title:'Synthetic output',fileName:'output.md'});const task=createTask(b,{projectId:'default',intent:'evaluate'});
 const contract=compileContract(b,task,{text:'Evaluate'},resolveRefs(b,task,[{versionId:copy.id},{versionId:evidence.id}]));assert.equal(contract.openQuestions.length,1);assert.match(contract.openQuestions[0],/历史标准摘要/);
});

test('image URL decoding accepts Unicode and spaces without admitting schemes or malformed escapes',()=>{
 assert.equal(new URL(packageImageURL('/api/versions/a/download','%E5%9B%BE%20one.png')!,'http://localhost').searchParams.get('path'),'图 one.png');
 for(const path of ['https://example.invalid/a.png','%2Fetc/passwd','%5Csecret','%0Asecret','bad%path'])assert.equal(packageImageURL('/api/versions/a/download',path),undefined);
});

test('sharing copies all records beyond the previous one-million-row truncation boundary',t=>{
 const {a,b}=setup(t);const count=1000001;const original=resource(a,{kind:'dataset',fileName:'large.json',mime:'application/json',text:'['+'{},'.repeat(count-1)+'{}]'});
 const result=importShare(b,{projectId:'default',package:packageFor(a,original)});const copy=b.get('versions',result.mapping[original.id]);
 assert.equal(copy.metadata.recordCount,count);assert.equal(b.db.prepare('SELECT COUNT(*) AS n FROM records WHERE version_id=?').get(copy.id).n,count);assert.equal(b.records(copy.id,count-1,1)[0].sourceRow,count);
});


test('shared skill aliases cannot overwrite SKILL.md during materialization',t=>{
 const {a,b}=setup(t);seedAssets(a,join(import.meta.dirname,'..'));const skill=a.list('versions').find(v=>v.kind==='skill');const p=packageFor(a,skill);const main=p.entries.find(e=>e.key===skill.id)!;const companion=p.entries.find(e=>e.key!==skill.id)!;const files=main.metadata.skillFiles as any[];files.find(f=>f.key===companion.key).path='skill.md';companion.path=main.path.replace(/SKILL.md$/,'skill.md');resign(p);
 assert.throws(()=>importShare(b,{projectId:'default',package:p}),/重复路径/);assert.equal(b.list('versions').length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/index.ts';
test('HTTP resources, version references, project memory and import errors persist truthfully',async t=>{
  const root=mkdtempSync(join(tmpdir(),'openeval-http-'));const app=createApp(root);
  await new Promise<void>((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
  const address=app.server.address() as any;const base=`http://127.0.0.1:${address.port}`;
  t.after(async()=>{await app.close();rmSync(root,{recursive:true,force:true});});
  async function call(path:string,method='GET',payload?:any){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},...payload?{body:JSON.stringify(payload)}:{}});return {status:r.status,data:await r.json() as any};}
  assert.equal((await call('/api/showcase')).data.cases.length,0);assert.equal((await call('/api/example-packs')).data.packs.length,0);
  const blank=await call('/api/tasks','POST',{projectId:'default',requestId:'blank-session'});const same=await call('/api/tasks','POST',{projectId:'default',requestId:'blank-session'});assert.equal(blank.data.id,same.data.id);assert.equal(blank.data.title,'新任务');assert.equal((await call(`/api/tasks/${blank.data.id}`)).data.runs.length,0);assert.ok((await call('/api/tasks')).data.tasks.some((task:any)=>task.id===blank.data.id));
  const resource=await call('/api/resources','POST',{projectId:'default',kind:'standard',title:'标准',text:'1–5分；无总分'});assert.equal(resource.status,201);
  const revision=await call(`/api/resources/${resource.data.resourceId}/versions`,'POST',{text:'1–5分；无总分；新条款'});assert.equal(revision.data.version,2);
  const original=await call(`/api/versions/${resource.data.id}`);assert.equal(original.data.text,'1–5分；无总分');
  const search=await call('/api/search?projectId=default&q=标准');assert.ok(search.data.resources.some((v:any)=>v.id===revision.data.id));assert.ok(!search.data.resources.some((v:any)=>v.id===resource.data.id));
  const task=await call('/api/tasks','POST',{projectId:'default',intent:'evaluate'});
  const result=await call(`/api/tasks/${task.data.id}/messages`,'POST',{text:'评测现有产物',refs:[{versionId:resource.data.id}],requestId:'one'});assert.equal(result.status,202);assert.equal(result.data.run.status,'waiting');assert.equal(result.data.contract.refs[0].versionId,resource.data.id);
  const detail=await call(`/api/tasks/${task.data.id}`);assert.equal(detail.data.runs.length,1);assert.equal(detail.data.messages.length,2);
  const before=await call('/api/resources?kind=standard');const failed=await call('/api/resources/import-link','POST',{projectId:'default',kind:'standard',url:'http://127.0.0.1/secrets'});assert.equal(failed.status,400);const listed=await call('/api/resources?kind=standard');assert.equal(listed.data.resources.length,before.data.resources.length);
  const blocked=await fetch(base+'/api/projects',{headers:{Origin:'https://untrusted.example'}});assert.equal(blocked.status,403);
  const memory=await call('/api/memories','POST',{scope:'project',projectId:'default',content:'按用户模板',source:'本次要求'});assert.equal(memory.status,201);
  assert.equal((await call(`/api/memories/${memory.data.id}`,'DELETE')).status,200);assert.equal((await call('/api/memories')).data.memories.length,0);
});
test('link refresh creates an immutable version of the same resource and failure creates none',async t=>{
  const root=mkdtempSync(join(tmpdir(),'openeval-link-http-'));
  const app=createApp(root,{fetchLink:async url=>{if(url.endsWith('/missing'))throw new Error('Fixture failure');return {bytes:Buffer.from('新链接规则：三档文字，不换算百分比。'),mime:'text/plain',url};}});
  await new Promise<void>((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
  t.after(async()=>{await app.close();rmSync(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${(app.server.address() as any).port}`;
  const oldResponse=await fetch(base+'/api/resources',{method:'POST',body:JSON.stringify({projectId:'default',kind:'standard',title:'同一标准',text:'旧规则保留'})});const old=await oldResponse.json() as any;
  const response=await fetch(base+`/api/resources/${old.resourceId}/import-link`,{method:'POST',body:JSON.stringify({url:'https://example.com/rule.txt',versionLabel:'V2.1'})});
  assert.equal(response.status,201);const updated=await response.json() as any;assert.equal(updated.resourceId,old.resourceId);assert.equal(updated.version,2);assert.equal(updated.source.type,'url');assert.notEqual(updated.hash,old.hash);
  assert.equal(app.store.get('versions',old.id).text,'旧规则保留');
  const count=app.store.list('versions').length;const failed=await fetch(base+`/api/resources/${old.resourceId}/import-link`,{method:'POST',body:JSON.stringify({url:'https://example.com/missing'})});assert.equal(failed.ok,false);assert.equal(app.store.list('versions').length,count);
});
test('a second server cannot recover or mutate the same active data directory',async t=>{
 const root=mkdtempSync(join(tmpdir(),'openeval-lease-'));const app=createApp(root);app.store.put('runs',{id:'live',taskId:'task',status:'running'},'task');assert.throws(()=>createApp(root),/已有运行/);assert.equal(app.store.get('runs','live').status,'running');await app.close();const next=createApp(root);assert.equal(next.store.get('runs','live').status,'interrupted');await next.close();rmSync(root,{recursive:true,force:true});
});

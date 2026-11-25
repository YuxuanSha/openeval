import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { createTask } from '../server/domain.ts';
import { Runtime } from '../server/runtime.ts';
import { createApp } from '../server/index.ts';
import { permissionProfiles } from '../shared/permissions.ts';

async function finished(store:any, runId:string){for(let i=0;i<120;i++){const run=store.get('runs',runId);if(!['queued','running','waiting'].includes(run.status))return run;await new Promise(r=>setTimeout(r,15));}throw Error('run did not finish');}
function fixture(t:any, mismatch=false){
  const root=mkdtempSync(join(tmpdir(),'openeval-permission-'));
  const store=new Store(root); const calls:any[]=[];
  const runtime=new Runtime(store,root,()=>new class extends EventEmitter{
    onRequest:any; async initialize(){}
    close(){}
    async call(method:string,params:any){
      calls.push({method,params});
      if(method==='account/read')return {account:{type:'chatgpt'}};
      if(method==='model/list')return {data:[{model:'mock-model',isDefault:true,defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium'},{reasoningEffort:'high'}]}]};
      if(method==='thread/start'||method==='thread/resume')return {thread:{id:'fixture-thread'},model:'mock-model',modelProvider:'openai',sandbox:{type:!mismatch&&params.sandbox==='danger-full-access'?'dangerFullAccess':'workspaceWrite'},approvalPolicy:mismatch?'on-request':params.approvalPolicy,approvalsReviewer:mismatch?'user':params.approvalsReviewer};
      if(method==='turn/start'){setTimeout(()=>this.emit('notification',{method:'turn/completed',params:{threadId:'fixture-thread',turn:{id:'fixture-turn',status:'completed'}}}),5);return {turn:{id:'fixture-turn'}};}
      throw Error(`Unexpected method ${method}`);
    }
  } as any);
  t.after(async()=>{await runtime.close();store.close();rmSync(root,{recursive:true,force:true});});
  return {store,runtime,calls,task:createTask(store,{projectId:'default',intent:'chat'})};
}
test('each selected profile reaches Codex, including when resuming an existing thread',async t=>{
  const {store,runtime,calls,task}=fixture(t);
  for(const mode of ['ask','auto','full','ask'] as const) {
    const profile=permissionProfiles[mode];const result=runtime.submit(task.id,{text:'Synthetic permission check',requestId:crypto.randomUUID(),model:'mock-model',effort:'high',permissionMode:mode});
    const run=await finished(store,result.run.id);
    assert.equal(run.status,'completed',run.error??'');
    assert.equal(run.permissionMode,mode);
    const params=calls.findLast(c=>c.method==='thread/start'||c.method==='thread/resume').params;
    for(const [key,value] of Object.entries(profile))assert.equal(params[key],value);
    assert.equal(calls.findLast(c=>c.method==='turn/start').params.effort,'high');
  }
  assert.deepEqual(calls.filter(c=>c.method.startsWith('thread/')).map(c=>c.method),['thread/start','thread/resume','thread/resume','thread/resume']);
});
test('does not start a turn if Codex narrows the explicitly requested mode',async t=>{
  const {store,runtime,calls,task}=fixture(t,true);
  const result=runtime.submit(task.id,{text:'Synthetic mismatch',requestId:'mismatch',permissionMode:'full'});
  const run=await finished(store,result.run.id);
  assert.equal(run.status,'failed');assert.match(run.error,/未接受所选权限/);
  assert.equal(calls.some(c=>c.method==='turn/start'),false);
});
test('local API rejects elevated modes from unconstrained browser requests; legacy submissions stay manual',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'openeval-http-permission-'));const app=createApp(dir,{privateExamples:false});
  await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  const url='http://127.0.0.1:'+(app.server.address() as any).port;
  const post=(path:string,body:any,headers:Record<string,string>={'content-type':'application/json'})=>fetch(url+path,{method:'POST',headers,body:JSON.stringify(body)});
  const task=await (await post('/api/tasks',{intent:'evaluate',projectId:'default'})).json();
  const path=`/api/tasks/${task.id}/messages`;const payload={text:'Check permission handling',intent:'evaluate',requestId:'request',permissionMode:'full'};
  assert.equal((await post(path,payload)).status,403);
  assert.equal((await post(path,payload,{'content-type':'text/plain',origin:url})).status,403);
  assert.equal((await post(path,payload,{'content-type':'application/json',origin:'https://not-openeval.example'})).status,403);
  const invalid=await post(path,{...payload,permissionMode:'typo'},{'content-type':'application/json',origin:url});assert.equal(invalid.status,400);
  const safe=await post(path,{...payload,permissionMode:undefined});assert.equal(safe.status,202);assert.equal((await safe.json()).run.permissionMode,'ask');
  const elevated=await post(path,{...payload,requestId:'new'},{'content-type':'application/json',origin:url});assert.equal(elevated.status,202);assert.equal((await elevated.json()).run.permissionMode,'full');
});

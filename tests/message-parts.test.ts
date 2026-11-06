import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { projectMessageParts } from '../server/message-parts.ts';

test('read projection reconstructs phases, full text, stable order and legacy runs without changing source rows',t=>{
  const root=mkdtempSync(join(tmpdir(),'openeval-trace-'));const store=new Store(root);
  t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
  store.put('messages',{id:'m',role:'assistant',text:'original combined message'},'t');
  store.event('t','r','tool.started',{item:{id:'c',type:'agentMessage',phase:'commentary'}});
  store.event('t','r','assistant.delta',{itemId:'c',text:'读取依据。'});
  for(let i=0;i<1100;i++)store.event('t','r','progress',{message:'irrelevant'});
  store.event('t','r','tool.completed',{item:{id:'c',type:'agentMessage',phase:'commentary',text:'读取依据。'}});
  store.event('t','r','tool.completed',{item:{id:'answer',type:'agentMessage',phase:'final_answer',text:'最终回答'.repeat(6000)}});
  store.event('t','legacy','assistant.delta',{itemId:'one',text:'第一阶段'});
  store.event('t','legacy','assistant.delta',{itemId:'two',text:'结束回答'});
  store.event('other','r','assistant.delta',{itemId:'no',text:'wrong task'});
  const parts=projectMessageParts(store.assistantEvents('t'));
  assert.deepEqual(parts.get('r')?.map(p=>p.id),['c','answer']);
  assert.equal(parts.get('r')?.[0].text,'读取依据。');
  assert.equal(parts.get('r')?.[1].text.length,24000);
  assert.equal(parts.get('r')?.[1].phase,'final_answer');
  assert.deepEqual(parts.get('legacy')?.map(p=>p.text),['第一阶段','结束回答']);
  assert.deepEqual(store.get('messages','m'),{id:'m',role:'assistant',text:'original combined message'});
});

test('raw trace download is run-scoped, read-only and includes events beyond one replay page',async t=>{
  const {createApp}=await import('../server/index.ts');const {createTask}=await import('../server/domain.ts');
  const root=mkdtempSync(join(tmpdir(),'openeval-trace-http-'));const app=createApp(root);t.after(async()=>{await app.close();rmSync(root,{recursive:true,force:true});});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const task=createTask(app.store,{title:'Synthetic trace export',projectId:'default'});
  app.store.put('runs',{id:'r',taskId:task.id,status:'completed'},task.id);
  for(let i=0;i<1105;i++)app.store.event(task.id,'r','progress',{message:`event ${i}`});
  app.store.event(task.id,'other','progress',{message:'excluded'});
  const port=(app.server.address() as any).port;
  const res=await fetch(`http://127.0.0.1:${port}/api/runs/r/trace`);const data=await res.json();
  assert.equal(res.status,200);assert.match(res.headers.get('content-disposition')||'',/attachment/);assert.equal(data.events.length,1105);assert.equal(data.events.at(-1).data.message,'event 1104');
  assert.equal(app.store.list('messages',task.id).length,0);assert.equal(app.runtime.active.size,0);
});

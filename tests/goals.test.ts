import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../server/store.ts';
import { createTask } from '../server/domain.ts';
import { Runtime, RPC } from '../server/runtime.ts';
import { parseGoalMode } from '../server/goals.ts';
async function until(check:()=>any){const end=Date.now()+7000;while(Date.now()<end){const value=check();if(value)return value;await new Promise(r=>setTimeout(r,20));}throw new Error('Timeout');}
function setup(t:any){const root=mkdtempSync(join(tmpdir(),'openeval-goal-'));const store=new Store(root);const runtime=new Runtime(store,root,cwd=>new RPC(cwd,process.execPath,[resolve('tests/fixtures/goal-rpc-fixture.mjs')]));t.after(async()=>{await runtime.close();store.close();rmSync(root,{recursive:true,force:true});});return {store,runtime,task:createTask(store,{projectId:'default',intent:'standard'})};}
test('goal activation survives completed initial turn and completes only after native goal and final artifacts',async t=>{
  const {store,runtime,task}=setup(t);const result=runtime.submit(task.id,{text:'完成范围内标准文件',requestId:'goal',goalMode:{objective:'交付标准',tokenBudget:2000,maxTurns:3,deadlineSeconds:30}});
  await until(()=>!runtime.active.size&&store.get('runs',result.run.id).status==='completed');const run=store.get('runs',result.run.id);assert.equal(run.turnCount,2);assert.equal(run.goalState.status,'complete');assert.equal(run.validationStatus,'not_checked');
  assert.ok(store.list('artifacts').some(item=>item.name==='final.txt'));const events=store.events(task.id);assert.equal(events.filter(e=>e.kind==='turn.completed').length,2);assert.equal(events.at(-1).data.status,'completed');assert.ok(!JSON.stringify(events).includes('SECRET_REASONING'));assert.ok(!JSON.stringify(events).includes('secret-test-credential'));
  const calls=JSON.parse(store.blobBytes(store.list('artifacts').find(item=>item.name==='calls.json').hash).toString());assert.equal(calls.filter((call:any)=>call.method==='turn/start').length,1);assert.ok(calls.findIndex((call:any)=>call.method==='thread/goal/set'&&call.params.status==='paused')<calls.findIndex((call:any)=>call.method==='turn/start'));
});
test('goal cancel pauses native goal before interrupting current turn',async t=>{
  const {store,runtime,task}=setup(t);const result=runtime.submit(task.id,{text:'HOLD_GOAL',requestId:'hold-goal',goalMode:{objective:'有边界交付',tokenBudget:2000,maxTurns:3,deadlineSeconds:30,origin:'user'}});
  await until(()=>store.get('runs',result.run.id).goalState?.status==='active');await runtime.cancel(result.run.id);assert.equal(store.get('runs',result.run.id).status,'cancelled');
  const calls=JSON.parse(store.blobBytes(store.list('artifacts').find(item=>item.name==='calls.json').hash).toString());const lastPause=calls.findLastIndex((call:any)=>call.method==='thread/goal/set'&&call.params.status==='paused');const interrupt=calls.findIndex((call:any)=>call.method==='turn/interrupt');assert.ok(lastPause<interrupt);assert.equal(store.get('runs',result.run.id).goalState.status,'paused');
});
test('goal bounds are explicit and automatic selection never pretends user origin',()=>{assert.equal(parseGoalMode({objective:'one'})?.origin,'automatic');assert.throws(()=>parseGoalMode({objective:'one',maxTurns:0}),/maxTurns/);assert.throws(()=>parseGoalMode(true),/目标/);});
test('maximum turn bound stops without activating an extra native turn',async t=>{
  const {store,runtime,task}=setup(t);const result=runtime.submit(task.id,{text:'最多一轮的合成检查',requestId:'one-turn',goalMode:{objective:'完成合成检查',maxTurns:1,tokenBudget:2000,deadlineSeconds:30}});
  await until(()=>!runtime.active.size&&store.get('runs',result.run.id).status==='interrupted');const run=store.get('runs',result.run.id);assert.equal(run.turnCount,1);assert.equal(run.stopReason,'max_turns_reached');assert.equal(run.goalState.status,'paused');
  const calls=JSON.parse(store.blobBytes(store.list('artifacts').find(item=>item.name==='calls.json').hash).toString());assert.ok(!calls.some((call:any)=>call.method==='thread/goal/set'&&call.params.status==='active'));
});
test('new goals have no implicit token, time or turn limits',async t=>{
  assert.deepEqual(parseGoalMode({objective:'完成合成标准',origin:'user'}),{objective:'完成合成标准',origin:'user',tokenBudget:null,deadlineSeconds:null,maxTurns:null});
  const {store,runtime,task}=setup(t);const result=runtime.submit(task.id,{text:'交付合成标准',requestId:'no-limits',goalMode:{objective:'完成合成标准',origin:'user'}});
  await until(()=>!runtime.active.size&&store.get('runs',result.run.id).status==='completed');
  const calls=JSON.parse(store.blobBytes(store.list('artifacts').find(item=>item.name==='calls.json').hash).toString());
  const prepare=calls.find((call:any)=>call.method==='thread/goal/set'&&call.params.objective);
  assert.equal(prepare.params.tokenBudget,null,'explicit null clears any persisted CLI budget');
  assert.equal(store.get('runs',result.run.id).stopReason,undefined);
  assert.equal(store.get('runs',result.run.id).turnCount,2);
});

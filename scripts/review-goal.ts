// Opt-in, synthetic native goal cancellation and same-thread continuation.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:4340/api';const result:any={syntheticOnly:true,checks:[],startedAt:new Date().toISOString()};
const save=()=>writeFileSync('evidence/review-20261104/real-goal-cancel.json',JSON.stringify(result,null,2)+'\n');
async function api(path:string,body?:any){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(40000)});const d=await r.json() as any;if(!r.ok)throw Error(JSON.stringify(d));return d;}
async function waitFor(fn:()=>Promise<any>,ms=100000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,300));}throw Error('Timed out');}
try{
 const caps=await api('/runtime');assert.ok(caps.goals?.supported);const model=caps.models.find((m:any)=>m.id==='gpt-6.1-sol')??caps.models.find((m:any)=>m.isDefault);
 const task=await api('/tasks',{projectId:'default',title:'原生目标取消与续聊（合成）',intent:'standard',requestId:randomUUID()});result.taskId=task.id;save();
 const run=await api(`/tasks/${task.id}/messages`,{requestId:randomUUID(),text:'这是纯合成目标取消测试。读取本轮context，先写本轮 checkpoint.md，内容 SYNTHETIC_CHECKPOINT，并写manifest登记为standard。然后执行本地 sleep 20 等待，预期用户会取消。本轮不要完成目标，不要访问工作目录外文件或联网，不生成图片。',intent:'standard',model:model.id,effort:'low',goalMode:{objective:'本轮准备合成标准检查点，等待取消。后续是否继续由用户新消息决定。',tokenBudget:16000,deadlineSeconds:90,maxTurns:2,origin:'automatic'}});
 result.runId=run.run.id;save();
 await waitFor(async()=>{const d=await api(`/tasks/${task.id}`);const r=d.runs.find((r:any)=>r.id===run.run.id);if(['failed','completed','interrupted'].includes(r.status))throw Error(`Run ended before cancellation: ${r.status}`);if(d.pendingRequests.length)throw Error('Approval pending; not auto-approved');return r.goalState?.status==='active'&&r.turnId?r:false;});
 const cancelled=await api(`/runs/${run.run.id}/cancel`,{});assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.goalState?.status,'paused');result.cancelled=cancelled;save();
 const before=(await api(`/tasks/${task.id}`)).runs.find((r:any)=>r.id===run.run.id);await new Promise(r=>setTimeout(r,1800));const after=(await api(`/tasks/${task.id}`)).runs.find((r:any)=>r.id===run.run.id);assert.equal(after.turnCount,before.turnCount);assert.equal(after.status,'cancelled');result.checks.push('native goal paused and cancelled; no later turn appeared');
 const continuation=await api(`/tasks/${task.id}/messages`,{requestId:randomUUID(),text:'取消已完成。现在只执行单轮：读取当前context，写本轮 resumed.md=RESUMED_OK，并用manifest登记standard，名称合成恢复标准。不要等待、不要重新启动旧目标，不联网。',intent:'standard',model:model.id,effort:'low',goalMode:null});
 const resumed=await waitFor(async()=>{const d=await api(`/tasks/${task.id}`);const r=d.runs.find((r:any)=>r.id===continuation.run.id);return !['queued','running','waiting'].includes(r.status)?{d,r}:false;});assert.equal(resumed.r.status,'completed',resumed.r.error);assert.equal(resumed.r.threadId,cancelled.threadId);assert.equal(resumed.r.goalMode,null);assert.ok(resumed.d.artifacts.some((a:any)=>a.runId===resumed.r.id&&a.registrationStatus==='registered'));result.resumed=resumed.r;result.checks.push('explicit single-turn continuation uses same native thread and archives a new standard');result.passed=true;
}catch(error){result.passed=false;result.error=(error as Error).message;process.exitCode=1;}finally{result.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({passed:result.passed,taskId:result.taskId,checks:result.checks,error:result.error}));}

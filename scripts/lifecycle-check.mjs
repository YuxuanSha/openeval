// Exercise only the isolated instance explicitly named in the environment.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const port=process.env.OPENEVAL_PORT;
assert.ok(port&&port!=='4318'&&port!=='4319','Use an isolated test port');
const base=`http://127.0.0.1:${port}`;
const checks=[];
const run=action=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/local-service.mjs',action],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('exit',code=>resolve({code,stdout,stderr}));});
const health=async()=>await (await fetch(base+'/api/health')).json();
const first=await health();checks.push({name:'survives_original_launch_command',pid:first.instance.pid,pass:true});
const duplicate=await run('start');assert.equal(duplicate.code,0);assert.equal(JSON.parse(duplicate.stdout).pid,first.instance.pid);assert.equal(JSON.parse(duplicate.stdout).status,'already_running');checks.push({name:'repeat_start_same_instance',pass:true});
const stateFile=join(root,'.runtime',`server-${port}.json`);const originalState=readFileSync(stateFile,'utf8');
try{const wrong={...JSON.parse(originalState),instanceId:'identity-mismatch-fixture'};writeFileSync(stateFile,JSON.stringify(wrong));const refused=await run('stop');assert.equal(refused.code,1);assert.equal((await health()).instance.pid,first.instance.pid);checks.push({name:'identity_mismatch_refuses_signal',pass:true});}finally{writeFileSync(stateFile,originalState);}
const response=await fetch(base+'/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:'default',title:'启动停止验收（合成）',intent:'chat',requestId:'lifecycle-session'})});assert.equal(response.status,201);const task=await response.json();
// Keep an event connection open: shutdown must not hang on SSE clients.
const controller=new AbortController();const stream=fetch(base+`/api/tasks/${task.id}/events`,{signal:controller.signal}).catch(()=>null);
await new Promise(resolve=>setTimeout(resolve,200));const start=Date.now();
const stop=await run('stop');controller.abort();await stream;assert.equal(stop.code,0,stop.stderr);assert.equal(JSON.parse(stop.stdout).status,'stopped');checks.push({name:'graceful_stop_with_sse',elapsedMs:Date.now()-start,pass:true});
const restarted=await run('start');assert.equal(restarted.code,0,restarted.stderr);const second=await health();assert.notEqual(second.instance.id,first.instance.id);
const detail=await (await fetch(base+`/api/tasks/${task.id}`)).json();assert.equal(detail.task.id,task.id);assert.equal(detail.runs.length,0);checks.push({name:'restart_preserves_session_without_execution',pass:true,taskId:task.id});
const finalStop=await run('stop');assert.equal(finalStop.code,0,finalStop.stderr);
const logs=[JSON.parse(originalState).logFile,JSON.parse(restarted.stdout).logFile].map(path=>({path,content:readFileSync(path,'utf8')}));assert.ok(logs.every(item=>item.content.includes('shutdown_complete')));checks.push({name:'durable_start_and_shutdown_logs',pass:true});
writeFileSync(resolve(root,process.env.OPENEVAL_LIFECYCLE_EVIDENCE??'evidence/service-lifecycle.json'),JSON.stringify({createdAt:new Date().toISOString(),port:Number(port),dataDir:first.dataDir,checks,logs,realModelCalls:0},null,2));
console.log(JSON.stringify({checks,allPassed:true},null,2));

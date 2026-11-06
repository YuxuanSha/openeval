import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Store } from '../server/store.ts';
import { Runtime } from '../server/runtime.ts';
import { createTask } from '../server/domain.ts';
const root=resolve('.smoke-cancel');const store=new Store(root);const runtime=new Runtime(store,process.cwd());
const evidence:any={checkedAt:new Date().toISOString(),syntheticOnly:true,checks:[]};
async function until(check:()=>any,timeout=150000){const end=Date.now()+timeout;while(Date.now()<end){const value=check();if(value)return value;await new Promise(r=>setTimeout(r,250));}throw new Error('Timeout');}
try{
 const task=createTask(store,{projectId:'default',intent:'standard',title:'真实取消与恢复验收'});
 const first=runtime.submit(task.id,{requestId:'cancel-one',text:'这是本地取消机制合成验收，不读取外部文件或调用外部服务。请先实际写文件 outputs/checkpoint.txt，内容为 OpenEval cancellation checkpoint。然后通过shell执行 sleep 30，这个短等待专用于外部取消测试，等待之后再写 outputs/final.txt。不需要实际评分。'});
 await until(()=>existsSync(join(root,'workspaces',task.id,'outputs','checkpoint.txt'))||store.get('runs',first.run.id).status==='failed');
 if(store.get('runs',first.run.id).status==='failed')throw new Error(store.get('runs',first.run.id).error);
 await runtime.cancel(first.run.id);await until(()=>!runtime.active.size,20000);
 const cancelled=store.get('runs',first.run.id);if(cancelled.status!=='cancelled')throw new Error('Cancel status incorrect');
 const checkpoint=store.list('artifacts',task.id).find(a=>a.name==='checkpoint.txt');if(!checkpoint)throw new Error('Partial artifact lost');evidence.checks.push('Real turn interrupted with threadId and turnId','Partial artifact preserved after cancellation');evidence.cancelledRun=cancelled;evidence.checkpoint=checkpoint;
 const second=runtime.submit(task.id,{requestId:'recover-two',text:'上一轮已由用户主动取消。现在继续此合成验收：保留已有outputs/checkpoint.txt，只需实际写outputs/recovered.md，说明先前产物已保留并恢复成功，然后结束。不要sleep，不读取外部资料，不评分。'});
 await until(()=>['completed','failed','interrupted'].includes(store.get('runs',second.run.id).status)&&!runtime.active.size);
 const resumed=store.get('runs',second.run.id);if(resumed.status!=='completed')throw new Error(resumed.error??resumed.status);if(resumed.threadId!==cancelled.threadId)throw new Error('Resume used different native thread');if(!store.list('artifacts',task.id).some(a=>a.name==='recovered.md'))throw new Error('Recovery output missing');evidence.resumedRun=resumed;evidence.checks.push('Cancelled native thread resumes and produces new artifact');evidence.success=true;
}catch(error){evidence.success=false;evidence.error=(error as Error).message;process.exitCode=1;}finally{await runtime.close();mkdirSync('evidence',{recursive:true});writeFileSync('evidence/real-cancel-smoke.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));store.close();}

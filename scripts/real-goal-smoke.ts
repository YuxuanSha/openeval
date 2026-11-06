// Synthetic native-goal transport validation only. No private user material.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store } from '../server/store.ts';
import { seedAssets } from '../server/assets.ts';
import { createTask } from '../server/domain.ts';
import { Runtime } from '../server/runtime.ts';
const store=new Store(resolve('.smoke-goal'));seedAssets(store,process.cwd());const runtime=new Runtime(store,process.cwd());
const evidence:any={createdAt:new Date().toISOString(),syntheticOnly:true,privateMaterialsSubmitted:false};
try{
  const task=createTask(store,{projectId:'default',title:'原生目标模式合成协议验收',intent:'chat'});
  const result=runtime.submit(task.id,{requestId:'goal-two-turn-check',effort:'low',text:'这是纯合成协议验收，没有业务数据。当前第一轮只写 outputs/checkpoint.txt，内容 STAGE_ONE，然后本轮结束。不要在第一轮写final.txt，也不要将目标标complete。原生目标后续自动推进的第二轮只读取checkpoint.txt，写outputs/final.txt，内容 NATIVE_GOAL_OK，然后将原生目标标complete。不要创建图片、调用网络或访问工作目录外文件。不需要报告、其他评测或用户确认。',goalMode:{objective:'完成两阶段合成文件检查：第一轮checkpoint，后续原生自动turn读取checkpoint并写final.txt=NATIVE_GOAL_OK，核对后complete。若checkpoint已存在，不重复第一阶段。',tokenBudget:60000,deadlineSeconds:150,maxTurns:4,origin:'automatic'}});
  evidence.taskId=task.id;evidence.runId=result.run.id;
  const end=Date.now()+175000;while(Date.now()<end){await new Promise(r=>setTimeout(r,300));const run=store.get('runs',result.run.id);if(!runtime.active.has(run.id)&&!['queued','running'].includes(run.status)){evidence.run=run;break;}}
  if(!evidence.run){await runtime.cancel(result.run.id);throw new Error('Goal transport timeout');}
  evidence.events=store.events(task.id).filter(e=>['goal.updated','goal.limit','turn.started','turn.completed','run.status','error'].includes(e.kind));
  const artifacts=store.list('artifacts',task.id);evidence.artifacts=artifacts.map(a=>({name:a.name,hash:a.hash}));const final=artifacts.find(a=>a.name==='final.txt');
  evidence.success=evidence.run.status==='completed'&&evidence.run.goalState?.status==='complete'&&evidence.run.turnCount>=2&&!!final&&store.blobBytes(final.hash).toString().trim()==='NATIVE_GOAL_OK';
  if(!evidence.success)process.exitCode=1;
}catch(error){evidence.success=false;evidence.error=(error as Error).message;process.exitCode=1;}
finally{await runtime.close();mkdirSync('evidence',{recursive:true});writeFileSync('evidence/real-goal-smoke.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({success:evidence.success,error:evidence.error,run:evidence.run,artifacts:evidence.artifacts},null,2));store.close();}

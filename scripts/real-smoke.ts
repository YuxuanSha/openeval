import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Store } from '../server/store.ts';
import { createTask, addVersion } from '../server/domain.ts';
import { Runtime } from '../server/runtime.ts';
const root=resolve('.smoke-real');const store=new Store(root);const runtime=new Runtime(store,process.cwd());
const evidence:any={checkedAt:new Date().toISOString(),syntheticOnly:true,actualEvaluationDataUsed:false,checks:[]};
async function wait(runId:string){const deadline=Date.now()+180000;while(Date.now()<deadline){await new Promise(r=>setTimeout(r,400));const run=store.get('runs',runId);if(['completed','failed','cancelled','interrupted'].includes(run.status)&&!runtime.active.has(runId))return run;}await runtime.cancel(runId);throw new Error('Smoke timeout');}
runtime.on('event',(event:any)=>{if(['run.status','artifact','error','approval.requested'].includes(event.kind))console.log(JSON.stringify({kind:event.kind,data:event.data}));});
try {
  const task=createTask(store,{projectId:'default',intent:'standard',title:'合成标准CLI验收'});
  const started=runtime.submit(task.id,{requestId:'smoke-standard-1',text:'这是合成链路验收，只在当前任务目录内操作，不调用外部资料或服务。为简单文字问答的指令遵循共建一个简短标准：采用1–5分，不使用权重或综合百分制，列明五个分档。没有待评样本，也不要评分。请用文件工具实际写入 outputs/standard.md，并写 outputs/manifest.json，artifacts中声明path=standard.md、title=合成文字标准、kind=standard。最后简短说明完成。'});
  const run=await wait(started.run.id);evidence.firstRun=run;if(run.status!=='completed')throw new Error(run.error??`Run ${run.status}`);
  const artifacts=store.list('artifacts',task.id);const standard=artifacts.find(a=>a.name==='standard.md');if(!standard)throw new Error('No standard artifact');
  evidence.checks.push('Real CLI creates rubric artifact without samples or scores');evidence.artifacts=artifacts;evidence.events=store.events(task.id,0).map(e=>({id:e.id,kind:e.kind}));
  const template=addVersion(store,{projectId:'default',kind:'template',title:'合成模板',text:'必须使用以下三个章节，保留顺序：\n## 我的结论\n## 我的证据\n## 尚缺什么\n没有数据时写缺证据，不评分。'});
  const next=runtime.submit(task.id,{requestId:'smoke-report-1',intent:'report',refs:[{versionId:template.id}],text:'沿用刚才标准，在没有真实样本的条件下，按所引用模板创建一份明确写着“合成验收，无真实评测结论”的示例报告。三个章节原名原顺序必须保留，缺证据明示缺证据，不新建分数、不编造案例。写 outputs/report.md 和更新 manifest.json 保留standard.md登记，并登记report.md为kind=report。'});
  const second=await wait(next.run.id);evidence.secondRun=second;if(second.status!=='completed')throw new Error(second.error??`Run ${second.status}`);
  const report=store.list('artifacts',task.id).find(a=>a.name==='report.md');if(!report)throw new Error('No report artifact');const reportText=store.blobBytes(report.hash).toString();const positions=['我的结论','我的证据','尚缺什么'].map(s=>reportText.indexOf(s));if(positions.some(x=>x<0)||positions[0]>=positions[1]||positions[1]>=positions[2])throw new Error('Template order mismatch');
  if(run.threadId!==second.threadId)throw new Error('Native thread not resumed');evidence.checks.push('Native thread resumed','User template headings preserved without invented scores');evidence.success=true;
}catch(error){evidence.success=false;evidence.error=(error as Error).message;process.exitCode=1;}
finally{await runtime.close();mkdirSync('evidence',{recursive:true});writeFileSync(join('evidence','real-smoke.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({success:evidence.success,error:evidence.error,checks:evidence.checks}));store.close();}

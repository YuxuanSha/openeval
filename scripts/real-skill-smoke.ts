import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Store } from '../server/store.ts';
import { seedAssets } from '../server/assets.ts';
import { createTask, addVersion } from '../server/domain.ts';
import { Runtime } from '../server/runtime.ts';

const store=new Store(resolve('.smoke-skills'));seedAssets(store,process.cwd());
const runtime=new Runtime(store,process.cwd());
const evidence:any={checkedAt:new Date().toISOString(),syntheticOnly:true,actualEvaluationDataUsed:false,checks:[]};
try {
  const pack=spawnSync('/usr/bin/python3',['-c',"import io,zipfile,sys\nb=io.BytesIO()\nwith zipfile.ZipFile(b,'w') as z:\n z.writestr('own/SKILL.md','---\\nname: own-synthetic-method\\ndescription: Synthetic standard customization test\\n---\\nRead references/method.txt and apply its exact section labels and trace marker to the standard. Do not score any sample. User instructions and template always take priority.\\n')\n z.writestr('own/references/method.txt','Use these three sections in order: 范围约定 / 三档判例 / 待补证据. Include the literal synthetic trace marker OE-SKILL-7Q9 in the final document. Three levels are 充分、部分、未满足; no numeric score, weighting or percentage.\\n')\nsys.stdout.buffer.write(b.getvalue())"]);
  if(pack.status!==0)throw new Error('Synthetic package creation failed');
  const skill=addVersion(store,{projectId:'default',kind:'skill',title:'合成自定义标准方法',fileName:'own.zip',mime:'application/zip',contentBase64:pack.stdout.toString('base64')});
  if(store.list('runs').length)throw new Error('Upload unexpectedly created a run');
  evidence.checks.push('ZIP upload did not execute; original archive retained');
  const task=createTask(store,{projectId:'default',intent:'standard',title:'技能挂载合成验收'});
  const submission=runtime.submit(task.id,{requestId:'skill-smoke-1',refs:[{versionId:skill.id}],text:'这是一次合成技能链路验收，只使用当前任务资料，不访问外部服务。为“回答是否回应用户问题”起草一份极简三档文字标准。没有待评样本，不进行评分。使用本任务内置标准构建方法和我明确选定的自定义skill，后者的相对引用文件包含我要求的章节和标记，请实际读取并遵循。仅写 outputs/skill-standard.md 和 manifest.json（kind=standard），最后简短说明。'});
  evidence.builtinSkillVersions=submission.contract.skillVersionIds;evidence.userSkillVersion=skill.id;
  const deadline=Date.now()+180000;
  while(Date.now()<deadline){await new Promise(r=>setTimeout(r,400));if(!runtime.active.has(submission.run.id)&&['completed','failed','cancelled','interrupted'].includes(store.get('runs',submission.run.id).status))break;}
  const run=store.get('runs',submission.run.id);evidence.run=run;
  if(run.status!=='completed'){await runtime.cancel(run.id);throw new Error(run.error??`Run ${run.status}`);}
  const artifact=store.list('artifacts',task.id).find(a=>a.name==='skill-standard.md');if(!artifact)throw new Error('No skill standard output');
  const content=store.blobBytes(artifact.hash).toString();
  const labels=['范围约定','三档判例','待补证据'];const positions=labels.map(s=>content.indexOf(s));
  if(positions.some(p=>p<0)||positions.some((p,i)=>i>0&&p<=positions[i-1])||!content.includes('OE-SKILL-7Q9'))throw new Error('Selected skill reference was not applied');
  evidence.checks.push('Real CLI applied selected ZIP skill relative reference','Custom section order and synthetic trace marker preserved','Built-in skill snapshot staged with supporting files');
  evidence.artifacts=store.list('artifacts',task.id);evidence.eventKinds=store.events(task.id).map(e=>e.kind);evidence.success=true;
}catch(error){evidence.success=false;evidence.error=(error as Error).message;process.exitCode=1;}
finally{await runtime.close();mkdirSync('evidence',{recursive:true});writeFileSync('evidence/real-skill-smoke.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({success:evidence.success,error:evidence.error,checks:evidence.checks}));store.close();}

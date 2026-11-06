// Native-goal protocol double only; deliberately completes turn 1 before activation reply.
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const threadId='goal-fixture-thread';let goal=null,turnId='goal-turn-1',holding=false;
const calls=[];const save=()=>{mkdirSync('outputs',{recursive:true});writeFileSync('outputs/calls.tmp',JSON.stringify(calls));renameSync('outputs/calls.tmp','outputs/calls.json');};
const notify=(method,params)=>send({method,params:{threadId,...params}});
createInterface({input:process.stdin}).on('line',line=>{
  const frame=JSON.parse(line);const p=frame.params??{};const result=value=>send({id:frame.id,result:value});if(frame.method){calls.push({method:frame.method,params:p});save();}
  if(frame.method==='initialize')result({userAgent:'fixture'});
  else if(frame.method==='account/read')result({account:{type:'chatgpt'}});
  else if(frame.method==='model/list')result({data:[{model:'fixture-model',isDefault:true,supportedReasoningEfforts:[]}],nextCursor:null});
  else if(frame.method==='experimentalFeature/list')result({data:[{name:'goals',enabled:true,stage:'stable'}],nextCursor:null});
  else if(frame.method==='thread/start'||frame.method==='thread/resume')result({thread:{id:threadId},model:'fixture-model',modelProvider:'openai'});
  else if(frame.method==='thread/goal/get')result({goal});
  else if(frame.method==='thread/goal/set'){
    goal={threadId,objective:p.objective??goal?.objective,status:p.status??goal?.status,tokenBudget:p.tokenBudget??goal?.tokenBudget,tokensUsed:0,timeUsedSeconds:0};result({goal});notify('thread/goal/updated',{goal});
    if(p.status==='active'&&!holding)setTimeout(()=>{
      turnId='goal-turn-2';notify('turn/started',{turn:{id:turnId,status:'inProgress'}});
      notify('item/started',{turnId,item:{id:'hidden',type:'reasoning',rawContent:['SECRET_REASONING']}});
      notify('item/commandExecution/outputDelta',{turnId,itemId:'tool',delta:'Bearer secret-test-credential'});
      writeFileSync('outputs/final.txt','goal final artifact');writeFileSync('outputs/manifest.json',JSON.stringify({artifacts:[{path:'final.txt',kind:'standard',key:'fixture-goal'}]}));goal={...goal,status:'complete',tokensUsed:42};notify('thread/goal/updated',{goal});notify('turn/completed',{turn:{id:turnId,status:'completed'}});
    },60);
  }else if(frame.method==='turn/start'){
    holding=p.input[0].text.includes('HOLD_GOAL');result({turn:{id:turnId}});notify('turn/started',{turn:{id:turnId,status:'inProgress'}});notify('item/agentMessage/delta',{turnId,itemId:'assistant',delta:'准备完成。'});
    if(!holding)notify('turn/completed',{turn:{id:turnId,status:'completed'}});
  }else if(frame.method==='turn/interrupt'){result({});notify('turn/completed',{turn:{id:turnId,status:'interrupted'}});}
});

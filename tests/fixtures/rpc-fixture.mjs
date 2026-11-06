// Explicit protocol test double. Never used in the live application.
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync } from 'node:fs';
const input=createInterface({input:process.stdin});
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
let threadId='fixture-thread',turnId='fixture-turn';
input.on('line',line=>{const frame=JSON.parse(line);const p=frame.params??{};const result=value=>send({id:frame.id,result:value});
  if(frame.method==='initialize')result({userAgent:'fixture/1'});
  if(frame.method==='account/read')result({account:{type:'chatgpt'}});
  if(frame.method==='model/list')result({data:[{model:'fixture-model',displayName:'Protocol fixture',isDefault:true,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'}],inputModalities:['text']}],nextCursor:null});
  if(frame.method==='thread/start'||frame.method==='thread/resume')result({thread:{id:p.threadId??threadId},model:'fixture-model',modelProvider:'openai'});
  if(frame.method==='turn/start'){
    result({turn:{id:turnId}});send({method:'turn/started',params:{threadId,turn:{id:turnId}}});
    const prompt=p.input[0].text;
    mkdirSync('outputs',{recursive:true});writeFileSync('outputs/partial.txt','Protocol fixture partial artifact');writeFileSync('outputs/manifest.json',JSON.stringify({artifacts:[{path:'partial.txt',kind:'standard',key:'fixture-standard',title:'Protocol fixture standard'}]}));
    if(prompt.includes('UTF8_SPLIT')){const bytes=Buffer.from(JSON.stringify({method:'item/agentMessage/delta',params:{threadId,itemId:'unicode',delta:'中文证据'}})+'\n');const cut=bytes.indexOf(Buffer.from('中'))+1;process.stdout.write(bytes.subarray(0,cut));setTimeout(()=>{process.stdout.write(bytes.subarray(cut));send({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed'}}});},10);return;}
    send({method:'item/agentMessage/delta',params:{threadId,itemId:'message',delta:'fixture progress'}});
    if(prompt.includes('SIMULATE_FAILURE')){setTimeout(()=>process.exit(2),10);return;}
    if(prompt.includes('APPROVAL')){send({id:500,method:'item/commandExecution/requestApproval',params:{threadId,turnId,itemId:'command',command:'test-only command'}});return;}
    if(prompt.includes('HOLD'))return;
    send({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed'}}});
  }
  if(frame.id===500&&frame.result){writeFileSync('outputs/decision.json',JSON.stringify(frame.result));send({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed'}}});}
  if(frame.method==='turn/interrupt'){
    if(!p.threadId||!p.turnId){send({id:frame.id,error:{message:'threadId and turnId required'}});return;}
    writeFileSync('outputs/interrupt.json',JSON.stringify(p));result({});send({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'interrupted'}}});
  }
});

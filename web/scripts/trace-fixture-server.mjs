// Isolated in-memory QA server. Never opens a real store or starts Codex.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('web/dist');const streams=new Set();const calls=[];let offline=false;let seq=0;
const stamp='2026-11-05T07:00:00.000Z';
const task=(id,title)=>({id,projectId:'default',title,intent:'chat',createdAt:stamp,updatedAt:stamp,threadId:null});
const tasks=[task('trace-history','报告归档 · 过程交互验收'),task('trace-live','运行中 · 交互验收')];
const refs=Array.from({length:13},(_,i)=>({versionId:`v${i}`,hash:`hash-${i}`}));
const names=['评测标准','评测集','评分结果','分析记录','报告模板','参考资料 G2','参考资料 G4','参考资料 I2','参考资料 I4','参考资料 L4','来源清单','归档规则','数据口径'];
const versions=names.map((title,i)=>({id:`v${i}`,resourceId:`r${i}`,projectId:'default',kind:'reference',title,version:1,versionLabel:'版本 1',hash:`hash-${i}`,createdAt:stamp,source:{type:'text',name:title},text:'合成测试资料。没有真实业务内容。',mime:'text/plain',byteSize:50,metadata:{}}));
const run=(id,taskId,status)=>({id,taskId,contractId:`c-${id}`,status,model:'codex-fixture',effort:'high',createdAt:stamp,updatedAt:stamp,error:null});
const runs=[run('history-1','trace-history','completed'),run('history-2','trace-history','completed'),run('live-1','trace-live','running')];
const contracts=runs.map(r=>({id:r.contractId,taskId:r.taskId,userText:'检查报告并归档。',intent:'chat',goal:'检查报告并归档。',refs,assumptions:[],openQuestions:[],deliverables:[],allowedActions:[],finalPrompt:'Synthetic UI fixture',createdAt:stamp}));
const events=[];const pending=[];const parts={};let seeding=true;
function emit(taskId,runId,kind,data){const e={id:++seq,taskId,runId,kind,data,createdAt:(seeding?new Date(Date.parse(stamp)+seq*1000):new Date()).toISOString()};events.push(e);for(const x of streams)if(x.taskId===taskId)x.res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);return e;}
function msg(taskId,runId,id,text,phase){emit(taskId,runId,'tool.started',{item:{id,type:'agentMessage',phase}});emit(taskId,runId,'assistant.delta',{itemId:id,text});emit(taskId,runId,'tool.completed',{item:{id,type:'agentMessage',phase,text}});(parts[runId]??=[]).push({id,text,phase});}
msg('trace-history','history-1','intro','正在核对样本来源、引用版本和统计分母。','commentary');
msg('trace-history','history-1','answer-1','已核对样本来源与引用版本，可以继续整理报告。','final_answer');emit('trace-history','history-1','run.status',{status:'completed'});
msg('trace-history','history-2','c1','我会读取评分、口径和模板，保留原始分数和标题结构。','commentary');
for(let i=0;i<250;i++){const item={id:`command-${i}`,type:'commandExecution',command:i===0?'核对完整报告与标题顺序':`检查证据 ${String(i+1).padStart(3,'0')} · samples/${i+1}.json`};emit('trace-history','history-2','tool.started',{item});emit('trace-history','history-2','tool.completed',{item:{...item,status:'completed',exitCode:0,aggregatedOutput:i===0?'标题检查通过。\n'.repeat(4000)+'完整输出末尾 · TAIL-50000':'来源一致，版本已锁定；校验通过。'}});}
msg('trace-history','history-2','c2','正文与图表已生成，正在核对三种格式的标题顺序。','commentary');
msg('trace-history','history-2','answer-2','报告已生成并核对，保留了全部标题和原评分。\n\n- HTML 图文报告：图表与正文一致\n- Markdown 正文：标题与来源完整\n- 完整导出包：文件清单校验通过\n\n可以展开上方「执行过程」查看每一步的命令、输出和过程说明。','final_answer');emit('trace-history','history-2','run.status',{status:'completed'});
msg('trace-live','live-1','live-c','正在检查报告依据。','commentary');emit('trace-live','live-1','tool.started',{item:{id:'live-command',type:'commandExecution',command:'持续核对样本与报告输出'}});
for(const r of runs.filter(r=>r.status==='completed')){const own=events.filter(e=>e.runId===r.id);r.createdAt=own[0].createdAt;r.updatedAt=own.at(-1).createdAt;}
const messages=[...['history-1','history-2'].flatMap((r,i)=>[{id:`user-${r}`,taskId:'trace-history',role:'user',text:i?'请保留原始分数与模板，生成并核对报告。':'先核对本轮资料的来源和版本。',refs,runId:r,createdAt:stamp},{id:`assistant-${r}`,taskId:'trace-history',role:'assistant',text:parts[r].map(p=>p.text).join(''),parts:parts[r],refs:[],runId:r,createdAt:stamp}]),{id:'user-live',taskId:'trace-live',role:'user',text:'检查报告，过程保持可追溯。',refs,runId:'live-1',createdAt:stamp}];
seeding=false;
function detail(id){return {task:tasks.find(t=>t.id===id),messages:messages.filter(m=>m.taskId===id),runs:runs.filter(r=>r.taskId===id),contracts:contracts.filter(c=>c.taskId===id),artifacts:[],pendingRequests:pending.filter(p=>p.status==='pending')};}
const json=(res,v,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(v));};
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');const path=u.pathname;calls.push({method:req.method,path,after:u.searchParams.get('after')});
 if(path==='/__control'&&req.method==='POST'){
  let raw='';for await(const c of req)raw+=c;const {action}=JSON.parse(raw);const t='trace-live',r='live-1';
  if(action==='step')emit(t,r,'tool.started',{item:{id:`new-step-${seq}`,type:'commandExecution',command:`新步骤 ${seq}`}});
  if(action==='append')emit(t,r,'progress',{protocolMethod:'item/commandExecution/outputDelta',itemId:'live-command',text:'实时输出 · 已完成一批检查。\n'});
  if(action==='disconnect'){offline=true;for(const x of streams)x.res.end();streams.clear();}
  if(action==='reconnect')offline=false;
  if(action==='approval'){runs[2].status='waiting';const p={id:`approval-fixture-${seq}`,runId:r,kind:'approval',method:'item/commandExecution/requestApproval',params:{command:'写入 outputs/report.html（合成测试）',reason:'需要确认这一次写入。测试不会执行任何命令。'},status:'pending'};pending.push(p);emit(t,r,'run.status',{status:'waiting'});emit(t,r,'approval.requested',p);}
  if(action==='input'){runs[2].status='waiting';const p={id:'input-fixture',runId:r,kind:'input',params:{questions:[{id:'scope',question:'请选择报告范围',options:[{label:'保留全部原始样本'},{label:'仅当前批次'}]}]},status:'pending'};pending.push(p);emit(t,r,'input.requested',p);}
  if(action==='complete'){runs[2].status='completed';runs[2].updatedAt=new Date().toISOString();emit(t,r,'tool.completed',{item:{id:'live-command',type:'commandExecution',command:'持续核对样本与报告输出',aggregatedOutput:'全部核对完成。',exitCode:0}});msg(t,r,'live-answer','核对完成，全部原始数据已保留。','final_answer');messages.push({id:'assistant-live',taskId:t,role:'assistant',text:parts[r].map(p=>p.text).join(''),parts:parts[r],refs:[],runId:r,createdAt:stamp});emit(t,r,'run.status',{status:'completed'});}
  return json(res,{ok:true,action});
 }
 const response=path.match(/^\/api\/requests\/([^/]+)\/respond$/);
 if(response&&req.method==='POST'){
  let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);const request=pending.find(p=>p.id===response[1]);
  if(!request||request.status!=='pending')return json(res,{error:{message:'not pending'}},409);
  if(request.kind==='approval'&&body.decision!=='decline')return json(res,{error:{message:'Fixture never accepts approvals'}},405);
  request.status='resolved';request.response=body;emit('trace-live','live-1','request.resolved',{id:request.id,response:body});
  runs[2].status=pending.some(p=>p.status==='pending')?'waiting':'running';emit('trace-live','live-1','run.status',{status:runs[2].status});return json(res,{ok:true});
 }
 const trace=path.match(/^\/api\/runs\/([^/]+)\/trace$/);if(trace){res.setHeader('Content-Disposition',`attachment; filename=trace-${trace[1]}.json`);return json(res,{runId:trace[1],events:events.filter(e=>e.runId===trace[1])});}
 if(path==='/__checks')return json(res,{calls,pending,events:events.length});
 if(path==='/api/runtime')return json(res,{available:true,authenticated:true,models:[{id:'codex-fixture',label:'Codex fixture',efforts:['high'],defaultEffort:'high',isDefault:true}]});
 if(path==='/api/tasks')return json(res,{tasks});
 const d=path.match(/^\/api\/tasks\/([^/]+)$/);if(d)return json(res,detail(d[1]));
 const es=path.match(/^\/api\/tasks\/([^/]+)\/events$/);if(es){if(offline&&es[1]==='trace-live')return json(res,{error:'fixture offline'},503);res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});for(const e of events.filter(e=>e.taskId===es[1]&&e.id>Number(u.searchParams.get('after')||0)))res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);const x={taskId:es[1],res};streams.add(x);const timer=setInterval(()=>res.write(': heartbeat\n\n'),10000);req.on('close',()=>{clearInterval(timer);streams.delete(x);});return;}
 if(path==='/api/resources')return json(res,{resources:versions});
 const v=path.match(/^\/api\/versions\/v(\d+)$/);if(v)return json(res,versions[+v[1]]);
 const rv=path.match(/^\/api\/resources\/r(\d+)\/versions$/);if(rv)return json(res,{versions:[versions[+rv[1]]]});
 if(path==='/api/memories')return json(res,{memories:[]});
 if(path.startsWith('/api/'))return json(res,{error:{message:'QA endpoint is read-only'}},405);
 // Fixed-size frames exercise actual application CSS at narrow window sizes.
 if(path==='/__viewport'){const w=Number(u.searchParams.get('width')||390),h=Number(u.searchParams.get('height')||844);res.writeHead(200,{'Content-Type':'text/html'});res.end(`<html><body style="margin:0;background:#ddd"><iframe title="OpenEval test viewport" src="/tasks/trace-history" style="width:${w}px;height:${h}px;border:0"></iframe></body></html>`);return;}
 const file=path.startsWith('/assets/')?resolve(root,'.'+path):resolve(root,'index.html');if(!file.startsWith(root+'/'))return json(res,{error:'bad path'},400);
 try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':'text/html'});res.end(bytes);}catch{res.writeHead(404);res.end();}
});server.listen(4417,'127.0.0.1',()=>console.log('Trace QA: http://127.0.0.1:4417/tasks/trace-history (in-memory fixtures only)'));

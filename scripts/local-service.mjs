// Explicit local start/stop only: no launch agent, login hook, or automatic restart.
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const root=resolve(import.meta.dirname,'..');
const command=process.argv[2]??'status';
const port=Number(process.env.OPENEVAL_PORT??4318);
const dataDir=resolve(root,process.env.OPENEVAL_DATA_DIR??'.openeval-product');
const runtimeDir=join(root,'.runtime');
const stateFile=join(runtimeDir,`server-${port}.json`);
const lockFile=join(runtimeDir,`server-${port}.lock`);
const base=`http://127.0.0.1:${port}`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const alive=pid=>{if(!Number.isSafeInteger(pid)||pid<=1)return false;try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}};
const read=file=>{try{return JSON.parse(readFileSync(file,'utf8'));}catch{return null;}};
const output=value=>console.log(JSON.stringify(value,null,2));
const probe=async target=>{try{const response=await fetch(`${target??base}/api/health`,{signal:AbortSignal.timeout(700)});return response.ok?await response.json():null;}catch{return null;}};
const occupied=()=>new Promise((resolve,reject)=>{const socket=createConnection({host:'127.0.0.1',port});socket.setTimeout(700);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',error=>{socket.destroy();if(error.code==='ECONNREFUSED')resolve(false);else reject(error);});socket.once('timeout',()=>{socket.destroy();reject(new Error('端口探测超时，未启动其他进程'));});});
const same=(health,state)=>!!(health?.ok&&health.runtime==='codex'&&state&&health.instance?.id===state.instanceId&&health.instance?.pid===state.pid&&health.instance?.root===root&&health.dataDir===state.dataDir);
function save(value){const temporary=`${stateFile}.${process.pid}.tmp`;writeFileSync(temporary,JSON.stringify(value,null,2),{mode:0o600});renameSync(temporary,stateFile);}
function clear(state){if(read(stateFile)?.instanceId===state.instanceId)unlinkSync(stateFile);}
async function lock(){
  for(let attempt=0;attempt<50;attempt++){
    try{const fd=openSync(lockFile,'wx',0o600);writeFileSync(fd,JSON.stringify({pid:process.pid}));closeSync(fd);return;}
    catch(error){if(error.code!=='EEXIST')throw error;const owner=read(lockFile);if(owner&&!alive(owner.pid)){unlinkSync(lockFile);continue;}await delay(200);}
  }
  throw new Error('另一个启动或停止操作尚未结束；请稍后重试');
}
async function start(){
  const state=read(stateFile);const health=await probe();
  if(same(health,state)&&state.dataDir===dataDir){output({status:'already_running',url:base,...state});return;}
  if(health||await occupied())throw new Error(`端口 ${port} 已被其他或未受本启动器管理的进程占用；未停止它，也未启动新实例。`);
  if(state&&alive(state.pid))throw new Error(`记录中的进程 ${state.pid} 仍存在但无法核实身份；请检查 ${state.logFile}。未向该进程发信号。`);
  for(const file of readdirSync(runtimeDir).filter(name=>/^server-\d+\.json$/.test(name))){
    const other=read(join(runtimeDir,file));if(other?.dataDir===dataDir&&alive(other.pid))throw new Error(`该数据目录已有进程 ${other.pid} 使用，请先用对应端口停止。`);
  }
  if(!existsSync(join(root,'web/dist/index.html')))throw new Error('缺少已构建界面；请先完成 README 中的本地构建。');
  const instanceId=randomUUID();const logFile=join(runtimeDir,`server-${port}-${new Date().toISOString().replace(/[:.]/g,'-')}.log`);
  const fd=openSync(logFile,'a',0o600);let child;let spawnError=null;
  try{child=spawn(process.execPath,['--experimental-strip-types',join(root,'server/index.ts')],{cwd:root,detached:true,stdio:['ignore',fd,fd],env:{...process.env,OPENEVAL_PORT:String(port),OPENEVAL_DATA_DIR:dataDir,OPENEVAL_INSTANCE_ID:instanceId}});}finally{closeSync(fd);}
  child.on('error',error=>{spawnError=error;});child.unref();
  const next={pid:child.pid,instanceId,port,root,dataDir,logFile,startedAt:new Date().toISOString()};
  if(child.pid)save(next);
  for(let attempt=0;attempt<50;attempt++){
    if(spawnError)throw spawnError;
    if(same(await probe(),next)){output({status:'started',url:base,...next});return;}
    if(!alive(child.pid)){clear(next);throw new Error(`服务在就绪前退出；启动日志：${logFile}`);}
    await delay(150);
  }
  throw new Error(`服务尚未就绪；已保留实例记录和日志：${logFile}。不会自动启动重复实例。`);
}
async function stop(){
  const state=read(stateFile);const health=await probe();
  if(!state){output({status:health?'unmanaged_running':'not_managed',url:base,message:'没有匹配的管理记录，未向任何进程发信号。'});return;}
  if(!same(health,state)){
    if(!alive(state.pid)){clear(state);output({status:'stale_record_removed',pid:state.pid,message:'旧进程已不存在，未向任何进程发信号。'});return;}
    throw new Error(`无法核实实例 ${state.instanceId} 的身份；未停止进程 ${state.pid}。日志：${state.logFile}`);
  }
  process.kill(state.pid,'SIGTERM');
  for(let attempt=0;attempt<100;attempt++){
    if(!alive(state.pid)){clear(state);output({status:'stopped',pid:state.pid,logFile:state.logFile});return;}
    await delay(200);
  }
  throw new Error(`实例 ${state.pid} 尚未结束；保留记录，请检查 ${state.logFile}。未强制结束。`);
}
async function status(){const state=read(stateFile);const health=await probe();output({status:same(health,state)?'running':health?'unmanaged_running':state&&alive(state.pid)?'unresponsive':'stopped',url:base,record:state,health});}

try{
  if(Number(process.versions.node.split('.')[0])<24)throw new Error('OpenEval 需要 Node.js 24 或更新版本。');
  if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('OPENEVAL_PORT 必须是有效端口。');
  if(!['start','stop','status'].includes(command))throw new Error('Usage: node scripts/local-service.mjs start|stop|status');
  mkdirSync(runtimeDir,{recursive:true,mode:0o700});
  if(command==='status')await status();
  else {await lock();try{await (command==='start'?start():stop());}finally{if(read(lockFile)?.pid===process.pid)unlinkSync(lockFile);}}
}catch(error){console.error(error.message);process.exitCode=1;}

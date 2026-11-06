import {mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AppError} from './store.ts';
/** One serving process per data directory, including direct dev starts. */
export function acquireDataLease(root:string){
 mkdirSync(root,{recursive:true});const path=join(root,'.server-lease.json');const token=randomUUID();const value=JSON.stringify({pid:process.pid,token});
 for(let attempt=0;attempt<3;attempt++){
  try{writeFileSync(path,value,{flag:'wx',mode:0o600});return ()=>{try{if(readFileSync(path,'utf8')===value)unlinkSync(path);}catch(e){if((e as any).code!=='ENOENT')throw e;}};}
  catch(error){if((error as any).code!=='EEXIST')throw error;
   let raw:string,owner:any;try{raw=readFileSync(path,'utf8');owner=JSON.parse(raw);}catch{throw new AppError(409,'DATA_BUSY','数据目录的运行锁无法核实；未启动第二个实例。');}
   if(!Number.isSafeInteger(owner.pid)||owner.pid<=1)throw new AppError(409,'DATA_BUSY','数据目录的运行锁无效；请检查本地运行日志。');
   let alive=true;try{process.kill(owner.pid,0);}catch(e){alive=(e as any).code!=='ESRCH';}
   if(alive)throw new AppError(409,'DATA_BUSY','此数据目录已有运行中的实例，请使用现有入口或先关闭它。');
   if(readFileSync(path,'utf8')===raw)unlinkSync(path);
  }
 }
 throw new AppError(409,'DATA_BUSY','数据目录正在启动，请稍后重试。');
}

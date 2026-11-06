// Owned by the native window. Closing its stdin also cleans up after a host crash.
import {createApp} from '../server/index.ts';
import {isAbsolute} from 'node:path';
const port=Number(process.env.OPENEVAL_PORT??4318);
let app,stopping=false;
const emit=value=>console.log(JSON.stringify(value));
async function stop(reason,code=0){if(stopping)return;stopping=true;emit({event:'stopping',reason});const timeout=setTimeout(()=>process.exit(1),15000);timeout.unref();try{await app?.close();emit({event:'stopped',reason});process.exit(code);}catch{process.exit(1);}}
process.stdin.resume();process.stdin.on('end',()=>void stop('window-closed'));
for(const signal of ['SIGTERM','SIGINT','SIGHUP'])process.on(signal,()=>void stop(signal));
process.on('uncaughtException',e=>{emit({event:'error',message:e.code??e.message});void stop('error',1);});
process.on('unhandledRejection',e=>{emit({event:'error',message:String(e)});void stop('error',1);});
try{
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('本地端口必须在 1–65535 范围');
 if(Number(process.versions.node.split('.')[0])<24)throw Error('需要 Node.js 24 或更高版本');
 if(!process.env.OPENEVAL_DATA_DIR)throw Error('缺少持久数据目录');
 if(!isAbsolute(process.env.OPENEVAL_DATA_DIR))throw Error('持久数据目录必须是绝对路径，未创建数据');
 emit({event:'starting',phase:'open-data'});
 app=createApp(process.env.OPENEVAL_DATA_DIR);
 app.server.on('error',e=>{emit({event:'error',message:e.code==='EADDRINUSE'?`本地端口 ${port} 已被占用。请关闭已有 OpenEval 服务后重试；未停止其他程序。`:e.message});void stop('listen-failed',1);});
 app.server.listen(port,'127.0.0.1',()=>emit({event:'ready',url:`http://127.0.0.1:${port}`,instance:app.instance.id,pid:process.pid}));
}catch(e){emit({event:'error',message:e.message});void stop('startup-failed',1);}

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, basename, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, AppError, id, now } from './store.ts';
import { addVersion, createTask, resources, saveMemory, text, project } from './domain.ts';
import { Runtime, probe } from './runtime.ts';
import { acquireDataLease } from './data-lease.ts';
import { fetchLink } from './links.ts';
import { seedAssets, importHistoricalAssets, showcaseBundle } from './assets.ts';
import { exportShare, inspectShare, importShare, shareImage } from './sharing.ts';
import { projectMessageParts } from './message-parts.ts';

import { PACKAGE_ROOT as ROOT, PACKAGE_VERSION as VERSION } from './package-root.ts';
const json=(res:any,status:number,value:any)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
async function body(req:any){let length=0;const parts:Buffer[]=[];for await(const part of req){length+=part.length;if(length>56*1024*1024)throw new AppError(413,'BODY_SIZE','请求过大');parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString()||'{}');}catch{throw new AppError(400,'INVALID_JSON','请求格式无效');}}
const summary=(v:any)=>({...v,text:v.text.slice(0,1400),textTruncated:v.text.length>1400});
export function createApp(dataDir=join(ROOT,'.openeval'),options:{fetchLink?:typeof fetchLink,privateExamples?:boolean}={}) {
  const instance={id:process.env.OPENEVAL_INSTANCE_ID??id(),pid:process.pid,root:ROOT,startedAt:now()};
  const readLink=options.fetchLink??fetchLink;const privateExamples=(options.privateExamples??process.env.OPENEVAL_PRIVATE_EXAMPLES==='1')&&existsSync(join(ROOT,'assets','openeval-workflow-assets','manifest.json'));
  const releaseLease=acquireDataLease(resolve(dataDir));let store:Store;try{store=new Store(resolve(dataDir));store.recoverInterruptedRuns();seedAssets(store,ROOT);}catch(error){releaseLease();throw error;}const runtime=new Runtime(store,ROOT);let runtimeCache:any=null,runtimePending:Promise<any>|null=null;
  const server=createServer(async(req,res)=>{
    try{
      const origin=req.headers.origin;const host=req.headers.host??'';
      if(!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host))throw new AppError(403,'HOST_REJECTED','仅允许本机访问');
      if(origin&&origin!==`http://${host}`)throw new AppError(403,'ORIGIN_REJECTED','来源不匹配');
      const url=new URL(req.url??'/',`http://${host}`);const path=url.pathname;const method=req.method??'GET';
      if(path==='/api/health'&&method==='GET')return json(res,200,{ok:true,version:VERSION,dataDir:store.root,runtime:'codex',instance});
      if(path==='/api/projects'){
        if(method==='GET')return json(res,200,{projects:store.list('projects')});
        if(method==='POST'){const input=await body(req);const value={id:id(),name:text(input.name,'项目名',200),createdAt:now()};return json(res,201,store.insert('projects',value,value.id));}
      }
      if(path==='/api/tasks'){
        if(method==='GET'){const key=url.searchParams.get('projectId')??'default';project(store,key);return json(res,200,{tasks:store.list('tasks',key).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id))});}
        if(method==='POST')return json(res,201,createTask(store,await body(req)));
      }
      let match=path.match(/^\/api\/tasks\/([^/]+)(?:\/(messages|events))?$/);
      if(match){const task=store.get('tasks',match[1]);
        if(match[2]==='messages'&&method==='POST')return json(res,202,runtime.submit(task.id,await body(req)));
        if(match[2]==='events'&&method==='GET'){
          let after=Number(url.searchParams.get('after')??req.headers['last-event-id']??0);if(!Number.isSafeInteger(after)||after<0)after=0;
          res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});const send=(event:any)=>{if(event.taskId===task.id&&event.id>after){res.write(`id: ${event.id}\nevent: event\ndata: ${JSON.stringify(event)}\n\n`);after=event.id;}};
          let page;do{page=store.events(task.id,after);page.forEach(send);}while(page.length===1000);
          runtime.on('event',send);const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),20000);req.on('close',()=>{clearInterval(heartbeat);runtime.off('event',send);});return;
        }
        if(!match[2]&&method==='GET'){
          const parts=projectMessageParts(store.assistantEvents(task.id));
          const messages=store.list('messages',task.id).map(message=>message.role==='assistant'&&parts.has(message.runId)?{...message,parts:parts.get(message.runId)}:message);
          return json(res,200,{task,messages,runs:store.list('runs',task.id),contracts:store.list('contracts',task.id),artifacts:store.list('artifacts',task.id),pendingRequests:store.list('requests',task.id).filter(r=>r.status==='pending')});
        }
        if(!match[2]&&method==='PATCH'){const input=await body(req);return json(res,200,store.put('tasks',{...task,title:text(input.title,'标题',200),updatedAt:now()},task.projectId));}
      }
      match=path.match(/^\/api\/runs\/([^/]+)\/trace$/);
      if(match&&method==='GET'){
        const run=store.get('runs',match[1]);const events=[];let after=0,page;
        do{page=store.events(run.taskId,after);for(const event of page){after=event.id;if(event.runId===run.id)events.push(event);}}while(page.length===1000);
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="trace-${encodeURIComponent(run.id)}.json"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        res.end(JSON.stringify({runId:run.id,status:run.status,events},null,2));return;
      }
      match=path.match(/^\/api\/runs\/([^/]+)\/(cancel|retry)$/);if(match&&method==='POST'){const input=await body(req);return json(res,match[2]==='retry'?202:200,match[2]==='retry'?runtime.retry(match[1],input):await runtime.cancel(match[1]));}
      match=path.match(/^\/api\/requests\/([^/]+)\/respond$/);if(match&&method==='POST')return json(res,200,runtime.respond(match[1],await body(req)));
      if((path==='/api/resources'||path==='/api/search'||path==='/api/skills')&&method==='GET'){const rows=resources(store,url.searchParams.get('projectId')??'default',url.searchParams.get('q')??'',path==='/api/skills'?'skill':url.searchParams.get('kind')??undefined).map(summary);return json(res,200,path==='/api/skills'?{skills:rows}:{resources:rows});}
      if(path==='/api/resources'&&method==='POST')return json(res,201,addVersion(store,await body(req)));
      if(path==='/api/shares/export'&&method==='POST')return json(res,200,exportShare(store,await body(req)));
      if(path==='/api/shares/inspect'&&method==='POST')return json(res,200,inspectShare((await body(req)).package));
      if(path==='/api/shares/import'&&method==='POST')return json(res,201,importShare(store,await body(req)));
      match=path.match(/^\/api\/versions\/([^/]+)\/package-image$/);if(match&&method==='GET'){const image=shareImage(store,match[1],url.searchParams.get('path')??'');res.writeHead(200,{'Content-Type':image.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});res.end(image.bytes);return;}
      if(path==='/api/resources/import-link'&&method==='POST'){const input=await body(req);project(store,input.projectId);const fetched=await readLink(text(input.url,'链接',4000));const source={type:'url',url:fetched.url,name:basename(new URL(fetched.url).pathname)||'source.html',retrievedAt:now()};return json(res,201,addVersion(store,{...input,title:input.title??source.name,contentBase64:fetched.bytes.toString('base64'),fileName:source.name,mime:fetched.mime},undefined,source));}
      match=path.match(/^\/api\/resources\/([^/]+)\/import-link$/);if(match&&method==='POST'){
        const previous=store.list('versions').filter(v=>v.resourceId===match![1]).at(-1);if(!previous)throw new AppError(404,'NOT_FOUND','资料不存在');
        const input=await body(req);const fetched=await readLink(text(input.url,'链接',4000));
        const source={type:'url',url:fetched.url,name:basename(new URL(fetched.url).pathname)||'source.html',retrievedAt:now()};
        return json(res,201,addVersion(store,{...input,title:input.title??previous.title,contentBase64:fetched.bytes.toString('base64'),fileName:source.name,mime:fetched.mime},previous.resourceId,source));
      }
      match=path.match(/^\/api\/resources\/([^/]+)\/versions$/);if(match){const versions=store.list('versions').filter(v=>v.resourceId===match![1]);if(!versions.length)throw new AppError(404,'NOT_FOUND','资料不存在');if(method==='GET')return json(res,200,{versions:versions.map(summary)});if(method==='POST')return json(res,201,addVersion(store,await body(req),match[1]));}
      match=path.match(/^\/api\/versions\/([^/]+)(?:\/(download|records))?$/);if(match&&method==='GET'){const version=store.get('versions',match[1]);if(match[2]==='download'){res.writeHead(200,{'Content-Type':version.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(version.source.name??version.title)}`,'X-Content-Type-Options':'nosniff'});res.end(store.blobBytes(version.hash));return;}if(match[2]==='records'){const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);const limit=Math.min(1000,Math.max(1,Number(url.searchParams.get('limit'))||100));return json(res,200,{records:store.records(version.id,offset,limit),total:version.metadata.recordCount??0,offset,limit});}return json(res,200,version);}
      if(path==='/api/runtime'&&method==='GET'){if(!runtimeCache||url.searchParams.get('refresh')==='true'){runtimePending??=probe(ROOT).then(value=>runtimeCache=value).finally(()=>runtimePending=null);await runtimePending;}return json(res,200,runtimeCache);}
      if(path==='/api/memories'){if(method==='GET'){const projectId=url.searchParams.get('projectId')??'default';project(store,projectId);return json(res,200,{memories:store.list('memories').filter(m=>m.active&&(m.scope==='user'||m.projectId===projectId))});}if(method==='POST')return json(res,201,saveMemory(store,await body(req)));}
      match=path.match(/^\/api\/memories\/([^/]+)(?:\/(history))?$/);if(match){store.get('memories',match[1]);if(match[2]&&method==='GET')return json(res,200,{revisions:store.list('memory_history',match[1])});if(!match[2]&&method==='PATCH')return json(res,200,saveMemory(store,await body(req),match[1]));if(!match[2]&&method==='DELETE'){saveMemory(store,{active:false},match[1]);return json(res,200,{ok:true});}}
      match=path.match(/^\/api\/artifacts\/([^/]+)\/(download|preview)$/);if(match&&method==='GET'){const artifact=store.get('artifacts',match[1]);const headers:any={'Content-Type':artifact.mime,'X-Content-Type-Options':'nosniff'};if(match[2]==='download')headers['Content-Disposition']=`attachment; filename*=UTF-8''${encodeURIComponent(artifact.name)}`;else headers['Content-Security-Policy']="sandbox allow-scripts; default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'";res.writeHead(200,headers);res.end(store.blobBytes(artifact.hash));return;}
      if(path==='/api/example-packs'&&method==='GET')return json(res,200,{packs:privateExamples?[{id:'local-workflow-history',title:'本地历史工作流包',private:true,importRequired:true}]:[]});
      if(path==='/api/example-packs/import'&&method==='POST'){
        if(!privateExamples)throw new AppError(404,'PACK_UNAVAILABLE','未启用本地私有示例包');const input=await body(req);if(input.packId!=='local-workflow-history')throw new AppError(404,'PACK_UNAVAILABLE','示例包不存在');
        project(store,input.projectId);importHistoricalAssets(store,ROOT,input.projectId);return json(res,201,{ok:true,projectId:input.projectId,executionPerformed:false});
      }
      if(path==='/api/showcase'&&method==='GET')return json(res,200,showcaseBundle(ROOT,privateExamples));
      if(path.startsWith('/api/'))throw new AppError(404,'NOT_FOUND','接口不存在');
      if(method!=='GET')throw new AppError(405,'METHOD','不支持此操作');const web=join(ROOT,'web','dist');const candidate=resolve(web,'.'+decodeURIComponent(path));if(!candidate.startsWith(web+'/')&&candidate!==web)throw new AppError(403,'PATH','路径无效');const file=existsSync(candidate)&&extname(candidate)?candidate:join(web,'index.html');
      if(!existsSync(file)){res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8'});res.end('OpenEval后端已启动；前端正在集成。API: /api/health');return;}
      const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':`${mime[extname(file)]??'application/octet-stream'}`,'X-Content-Type-Options':'nosniff'});res.end(readFileSync(file));
    }catch(error){const e=error as any;if(!res.headersSent)json(res,e.status??500,{error:{code:e.code??'INTERNAL',message:e.status?e.message:'操作失败，请重试或检查本机运行环境',...e.details?{details:e.details}:{}}});else res.end();}
  });
  let closing:Promise<void>|null=null;
  return {server,store,runtime,instance,close:()=>closing??= (async()=>{await runtime.close();await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});try{store.close();}finally{releaseLease();}})()};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const log=(event:string,detail:any={})=>console.log(JSON.stringify({time:now(),event,pid:process.pid,...detail}));
  const port=Number(process.env.OPENEVAL_PORT??4318);
  if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('OPENEVAL_PORT must be a valid local port');
  let app:ReturnType<typeof createApp>|undefined;let stopping=false;
  const shutdown=async(reason:string,code=0)=>{
    if(stopping)return;stopping=true;log('shutdown_requested',{reason});
    const timeout=setTimeout(()=>{log('shutdown_timeout');process.exit(1);},15000);timeout.unref();
    try{await app?.close();log('shutdown_complete',{reason});process.exit(code);}
    catch(error){log('shutdown_failed',{code:(error as any).code??'UNKNOWN'});process.exit(1);}
  };
  process.on('uncaughtException',error=>{log('uncaught_exception',{name:error.name,code:(error as any).code??'UNKNOWN'});void shutdown('uncaught_exception',1);});
  process.on('unhandledRejection',error=>{log('unhandled_rejection',{name:(error as any)?.name??'Error',code:(error as any)?.code??'UNKNOWN'});void shutdown('unhandled_rejection',1);});
  for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.once(signal,()=>{void shutdown(signal);});
  try{
    app=createApp(process.env.OPENEVAL_DATA_DIR??join(ROOT,'.openeval'));
    app.server.once('error',error=>{log('listen_failed',{code:(error as any).code??'UNKNOWN',port});void shutdown('listen_failed',1);});
    app.server.listen(port,'127.0.0.1',()=>log('listening',{url:`http://127.0.0.1:${port}`,dataDir:app!.store.root,instance:app!.instance.id}));
  }catch(error){log('startup_failed',{code:(error as any).code??'UNKNOWN',message:(error as Error).message});void shutdown('startup_failed',1);}
}

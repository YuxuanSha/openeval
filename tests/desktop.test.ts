import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
async function port(){const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const p=(s.address() as any).port;await new Promise<void>(r=>s.close(()=>r()));return p;}
function child(data:string,p:number,cwd=resolve(import.meta.dirname,'..')){const process=spawn(globalThis.process.execPath,['--experimental-strip-types',resolve(import.meta.dirname,'../desktop/server.mjs')],{cwd,env:{...globalThis.process.env,OPENEVAL_DATA_DIR:data,OPENEVAL_PORT:String(p)},stdio:['pipe','pipe','pipe']});let output='';process.stdout.on('data',x=>output+=x);process.stderr.resume();const exited=new Promise<number|null>(r=>process.on('exit',r));async function wait(needle:string){const end=Date.now()+5000;while(!output.includes(needle)&&Date.now()<end&&process.exitCode===null)await new Promise(r=>setTimeout(r,20));assert.ok(output.includes(needle),output);}return {process,exited,wait,output:()=>output};}
function setup(t:any){const data=mkdtempSync(join(tmpdir(),'openeval-desktop-'));t.after(()=>rmSync(data,{recursive:true,force:true}));return data;}
test('desktop pipe closure stops backend and releases data lease',async t=>{const data=setup(t),p=await port(),c=child(data,p);t.after(()=>c.process.kill());await c.wait('"event":"ready"');const task=await (await fetch(`http://127.0.0.1:${p}/api/tasks`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:'default',title:'synthetic persistence'})})).json();c.process.stdin.end();assert.equal(await c.exited,0);const next=child(data,p);t.after(()=>next.process.kill());await next.wait('"event":"ready"');assert.ok((await (await fetch(`http://127.0.0.1:${p}/api/tasks`)).json()).tasks.some((t:any)=>t.id===task.id));next.process.stdin.end();await next.exited;});
test('desktop SIGTERM gracefully exits',async t=>{const c=child(setup(t),await port());t.after(()=>c.process.kill());await c.wait('"event":"ready"');c.process.kill('SIGTERM');assert.equal(await c.exited,0);assert.match(c.output(),/stopped/);});
test('desktop port conflicts are explicit and do not stop the owner',async t=>{const owner=createServer();await new Promise<void>(r=>owner.listen(0,'127.0.0.1',r));t.after(()=>owner.close());const c=child(setup(t),(owner.address() as any).port);assert.equal(await c.exited,1);assert.match(c.output(),/已被占用/);assert.ok(owner.listening);});
test('desktop rejects invalid ports before startup',async t=>{const c=child(setup(t),-1);assert.equal(await c.exited,1);assert.match(c.output(),/端口/);});
test('desktop second writer cannot interrupt the original backend',async t=>{const data=setup(t),p=await port(),first=child(data,p);t.after(()=>first.process.kill());await first.wait('"event":"ready"');const second=child(data,await port());assert.equal(await second.exited,1);assert.match(second.output(),/已有运行/);assert.equal((await (await fetch(`http://127.0.0.1:${p}/api/health`)).json()).ok,true);first.process.stdin.end();await first.exited;});
test('desktop uses the explicit data directory when bootstrapped from filesystem root',async t=>{
 const data=join(setup(t),'synthetic workspace 数据'),p=await port(),first=child(data,p,'/');t.after(()=>first.process.kill());
 await first.wait('"event":"ready"');const base=`http://127.0.0.1:${p}`;
 assert.equal((await (await fetch(`${base}/api/health`)).json()).dataDir,data);
 const task=await (await fetch(`${base}/api/tasks`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:'default',title:'cwd-independent persistence'})})).json();
 first.process.stdin.end();assert.equal(await first.exited,0);
 const next=child(data,p,'/');t.after(()=>next.process.kill());await next.wait('"event":"ready"');
 assert.ok((await (await fetch(`${base}/api/tasks`)).json()).tasks.some((row:any)=>row.id===task.id));
 assert.equal((await (await fetch(`${base}/`)).text()).includes('<html'),true);
 next.process.stdin.end();assert.equal(await next.exited,0);
});
test('desktop rejects a relative data directory instead of opening another store',async()=>{
 const run=child('relative-data',4318,'/');assert.equal(await run.exited,1);assert.match(run.output(),/必须是绝对路径/);assert.doesNotMatch(run.output(),/"event":"ready"/);
});

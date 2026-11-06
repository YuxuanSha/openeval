// Exercise the actual packaged backend with its bundled Node, an empty workspace,
// minimal PATH and deliberately unavailable Codex. Never submits model work.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,existsSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {once} from 'node:events';
const app=resolve(process.argv[2]??'');
const data=resolve(process.argv[3]??'');
if(process.argv.length!==4||existsSync(data))throw Error('Usage: verify-macos-distribution.mjs <app> <new-test-data-directory>');
mkdirSync(data,{recursive:true});
const node=join(app,'Contents/Frameworks/node');
const entry=join(app,'Contents/Resources/runtime/desktop/server.mjs');
const checks=[];
const children=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
function start(directory,port){
 const child=spawn(node,['--experimental-strip-types',entry],{cwd:'/',env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',OPENEVAL_DATA_DIR:directory,OPENEVAL_PORT:String(port),OPENEVAL_CODEX_BIN:'/usr/bin/false',OPENEVAL_PRIVATE_EXAMPLES:'0'},stdio:['pipe','pipe','pipe']});
 children.push(child);let output='';child.stdout.on('data',x=>output+=x);child.stderr.resume();
 const exit=once(child,'exit').then(([code])=>code);
 async function ready(){const deadline=Date.now()+10000;while(!output.includes('"event":"ready"')&&child.exitCode===null&&Date.now()<deadline)await pause(25);assert.match(output,/"event":"ready"/);}
 return {child,exit,ready,output:()=>output};
}
async function stop(run){run.child.stdin.end();assert.equal(await run.exit,0);}
try{
 const port=await freePort();const first=start(join(data,'workspace'),port);await first.ready();checks.push('bundled-node-minimal-path-startup');
 const base=`http://127.0.0.1:${port}`;
 async function call(path,body){const response=await fetch(base+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);assert.ok(response.ok,`${path}: ${response.status}`);return response.json();}
 assert.equal((await call('/api/health')).dataDir,join(data,'workspace'));
 const html=await(await fetch(base+'/')).text();assert.match(html,/<html/);const js=html.match(/src="([^"]+\.js)"/)[1];assert.ok((await fetch(base+js)).ok);checks.push('packaged-html-and-javascript');
 const runtime=await call('/api/runtime');assert.equal(runtime.available,false);assert.equal(runtime.authenticated,false);checks.push('explicit-codex-unavailable-no-account-use');
 const initial=await call('/api/resources');assert.equal(initial.resources.filter(r=>r.kind!=='skill').length,0);assert.equal(initial.resources.length,5);checks.push('only-five-generic-skills-no-user-data');
 const task=await call('/api/tasks',{projectId:'default',title:'Synthetic distribution persistence'});
 const standard=await call('/api/resources',{projectId:'default',kind:'standard',title:'Synthetic standard',text:'Pass iff the answer is YES. No total score.',fileName:'standard.md',versionLabel:'v1'});
 const report=await call('/api/resources',{projectId:'default',kind:'report',title:'Synthetic import check',text:'# Findings\n\n| Case | Outcome |\n|---|---|\n| Synthetic | pass |',fileName:'report.md'});
 const pkg=await call('/api/shares/export',{projectId:'default',versionIds:[standard.id,report.id]});
 assert.equal(pkg.format,'openeval.share');await call('/api/shares/inspect',{package:pkg});const imported=await call('/api/shares/import',{projectId:'default',package:pkg});assert.equal(imported.executionPerformed,false);assert.equal(imported.versionIds.length,2);checks.push('offline-share-export-inspect-import-without-execution');
 const download=await fetch(base+`/api/versions/${imported.mapping[report.id]}/download`);assert.equal(await download.text(),report.text);checks.push('imported-report-byte-roundtrip');
 const conflict=start(join(data,'port-conflict'),port);assert.equal(await conflict.exit,1);assert.match(conflict.output(),/已被占用/);assert.equal((await call('/api/health')).ok,true);checks.push('port-conflict-preserves-owner');
 await stop(first);const again=start(join(data,'workspace'),port);await again.ready();assert.ok((await call('/api/tasks')).tasks.some(t=>t.id===task.id));
 const saved=(await call('/api/resources')).resources;assert.ok(saved.some(r=>r.id===standard.id&&r.hash===standard.hash));assert.equal((await call(`/api/tasks/${task.id}`)).runs.length,0);checks.push('pipe-closure-restart-data-preserved-no-run');await stop(again);
 const provenance=JSON.parse(readFileSync(join(app,'Contents/Resources/node-provenance.json'),'utf8'));
 console.log(JSON.stringify({ok:true,bundledNode:provenance.version,checks,modelExecution:false,cleanMac:false,limits:['Same host; no fresh macOS user, VM or downloaded quarantine test.','Codex deliberately unavailable: no live inference or authentication tested here.']},null,2));
}finally{for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');}

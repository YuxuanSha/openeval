import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,linkSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../server/store.ts';
import {createTask,compileContract,addVersion,resolveRefs} from '../server/domain.ts';
import {Runtime} from '../server/runtime.ts';
import {redactEvent} from '../server/goals.ts';
function setup(t:any,intent='chat'){const root=mkdtempSync(join(tmpdir(),'openeval-review-'));const store=new Store(root);const runtime=new Runtime(store,root);const task=createTask(store,{projectId:'default',intent});t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});return {root,store,runtime,task};}
test('workspace preparation refuses a replaced context symlink and preserves the outside file',t=>{
 const {root,store,runtime,task}=setup(t);const contract=compileContract(store,task,{text:'synthetic task'},[]);const cwd=join(root,'workspaces',task.id);mkdirSync(cwd,{recursive:true});const outside=join(root,'outside.txt');writeFileSync(outside,'unchanged');symlinkSync(outside,join(cwd,'openeval-context.json'));
 assert.throws(()=>runtime.workspace(task,{id:'run'},contract),/路径|链接|文件/);assert.equal(readFileSync(outside,'utf8'),'unchanged');
});
test('workspace preparation refuses a replaced refs directory and hard-linked contract',t=>{
 const {root,store,runtime,task}=setup(t);const v=addVersion(store,{projectId:'default',kind:'reference',title:'reference',text:'synthetic'});const c=compileContract(store,task,{text:'synthetic'},resolveRefs(store,task,[{versionId:v.id}]));const cwd=join(root,'workspaces',task.id);mkdirSync(cwd,{recursive:true});const outside=join(root,'outside');mkdirSync(outside);symlinkSync(outside,join(cwd,'refs'));assert.throws(()=>runtime.workspace(task,{id:'one'},c),/路径|链接|文件/);
 rmSync(join(cwd,'refs'));const target=join(root,'untouched.txt');writeFileSync(target,'untouched');linkSync(target,join(cwd,'task-contract.json'));assert.throws(()=>runtime.workspace(task,{id:'two'},c),/路径|链接|文件/);assert.equal(readFileSync(target,'utf8'),'untouched');
});
test('report tasks cannot register a replacement standard even when explicitly referenced',t=>{
 const {store,runtime,task}=setup(t,'report');const v=addVersion(store,{projectId:'default',kind:'standard',title:'Locked rubric',text:'1–5 without total'});const c=compileContract(store,task,{text:'Write report only'},resolveRefs(store,task,[{versionId:v.id}]));store.insert('contracts',c,task.id);const run={id:'report-run',taskId:task.id,contractId:c.id};const cwd=runtime.workspace(task,run,c);const out=join(cwd,'outputs',run.id);writeFileSync(join(out,'changed.md'),'changed criteria');writeFileSync(join(out,'manifest.json'),JSON.stringify({artifacts:[{path:'changed.md',kind:'standard',resourceId:v.resourceId,baseVersionId:v.id}]}));assert.ok(runtime.collect(task,run,cwd).errors.length);assert.equal(store.list('versions').length,1);
});
test('structured batch parsing cannot silently accept malformed data under a text filename',t=>{
 const {store}=setup(t);for(const kind of ['dataset','artifact_batch','scoring_batch'])for(const fileName of ['rows.md','rows.txt','rows.bin'])assert.throws(()=>addVersion(store,{projectId:'default',kind,title:'Invalid records',text:'not a structured batch',fileName}),/解析|结构化/);assert.equal(store.list('versions').length,0);
});
test('nested turn items never expose hidden reasoning',()=>{
 const event=redactEvent({turn:{items:[{id:'r',type:'reasoning',summary:[{text:'HIDDEN_REASONING'}],content:[{text:'HIDDEN_CONTENT'}]},{type:'commandExecution',command:'echo synthetic',aggregatedOutput:'safe'}]}});assert.ok(!JSON.stringify(event).includes('HIDDEN_'));assert.ok(JSON.stringify(event).includes('echo synthetic'));
});
test('manual replacement does not inherit generated run or evidence claims',t=>{
 const {store}=setup(t);const generated=addVersion(store,{projectId:'default',kind:'report',title:'Old report',text:'old',metadata:{taskId:'old-task',runId:'old-run',contractId:'old-contract',artifactId:'old-artifact',logicalKey:'old',refs:[{versionId:'old-source'}],templateVersionIds:['old-template'],previousVersionId:'older'}},undefined,{type:'generated',name:'old.md'});const manual=addVersion(store,{text:'manual rewrite'},generated.resourceId);assert.equal(manual.source.type,'text');for(const key of ['taskId','runId','contractId','artifactId','logicalKey','refs','templateVersionIds'])assert.equal(manual.metadata[key],undefined,key);assert.equal(manual.metadata.previousVersionId,generated.id);
});
test('read-only store inspection does not interrupt a live run, and recovery preserves clarification waits',t=>{
 const {root,store}=setup(t);store.put('runs',{id:'live',taskId:'task',status:'running'},'task');store.put('runs',{id:'clarify',taskId:'task',status:'waiting'},'task');store.put('runs',{id:'approval',taskId:'task',status:'waiting'},'task');store.put('requests',{id:'req',taskId:'task',runId:'approval',status:'pending'},'task');const reader=new Store(root);assert.equal(reader.get('runs','live').status,'running');reader.close();store.recoverInterruptedRuns();assert.equal(store.get('runs','live').status,'interrupted');assert.equal(store.get('runs','clarify').status,'waiting');assert.equal(store.get('runs','approval').status,'interrupted');assert.equal(store.get('requests','req').status,'expired');
});
test('changed mounted evidence cannot be registered under its old pinned hash',t=>{
 const {store,runtime,task}=setup(t,'report');const source=addVersion(store,{projectId:'default',kind:'reference',title:'Pinned source',text:'ORIGINAL',fileName:'source.md'});const contract=compileContract(store,task,{text:'report only'},resolveRefs(store,task,[{versionId:source.id}]));store.insert('contracts',contract,task.id);const run={id:'integrity-run',taskId:task.id,contractId:contract.id};const cwd=runtime.workspace(task,run,contract);writeFileSync(join(cwd,'refs',source.id,'extracted.txt'),'ALTERED');const out=join(cwd,'outputs',run.id);writeFileSync(join(out,'report.md'),'claim based on changed input');writeFileSync(join(out,'manifest.json'),JSON.stringify({artifacts:[{path:'report.md',kind:'report'}]}));const result=runtime.collect(task,run,cwd);assert.ok(result.errors.length);assert.equal(result.registered,0);assert.equal(store.list('artifacts')[0].registrationStatus,'failed');assert.equal(store.blobBytes(source.hash).toString(),'ORIGINAL');assert.equal(store.list('versions').length,1);
});
test('collection refuses a workspace replaced with a linked directory',t=>{
 const {root,store,runtime,task}=setup(t);const contract=compileContract(store,task,{text:'synthetic'},[]);store.insert('contracts',contract,task.id);const run={id:'linked-workspace',taskId:task.id,contractId:contract.id};const cwd=runtime.workspace(task,run,contract);const moved=join(root,'moved-workspace');renameSync(cwd,moved);symlinkSync(moved,cwd);assert.throws(()=>runtime.collect(task,run,cwd),/路径|链接|文件/);assert.equal(store.list('artifacts').length,0);
});

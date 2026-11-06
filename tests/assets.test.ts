import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { seedAssets, importHistoricalAssets, showcaseBundle } from '../server/assets.ts';
import { addVersion, createTask, compileContract, resolveRefs } from '../server/domain.ts';
import { Runtime } from '../server/runtime.ts';
function context(t:any){const root=mkdtempSync(join(tmpdir(),'openeval-assets-'));const store=new Store(root);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});return {store,root};}
function archive(files:any[]){const code="import io,zipfile,json,sys,stat\nb=io.BytesIO()\nwith zipfile.ZipFile(b,'w') as z:\n for f in json.load(sys.stdin):\n  i=zipfile.ZipInfo(f['path'])\n  if f.get('symlink'): i.external_attr=(stat.S_IFLNK|0o777)<<16\n  z.writestr(i,f['text'])\nsys.stdout.buffer.write(b.getvalue())";const result=spawnSync('/usr/bin/python3',['-c',code],{input:JSON.stringify(files)});assert.equal(result.status,0);return result.stdout;}
test('five built-ins mount versioned relative resources; default contains no historical examples',t=>{const {store}=context(t);seedAssets(store,process.cwd());assert.equal(store.list('versions').length,5);assert.equal(store.list('versions').filter(v=>v.source.type==='historical').length,0);assert.equal(showcaseBundle(process.cwd()).cases.length,0);seedAssets(store,process.cwd());assert.equal(store.list('versions').length,5);assert.equal(store.list('runs').length,0);const task=createTask(store,{projectId:'default',intent:'standard'});const contract=compileContract(store,task,{text:'构建标准'},[]);assert.equal(contract.skillVersionIds.length,1);const cwd=new Runtime(store,process.cwd()).workspace(task,{id:'fixture'},contract);const skillId=contract.skillVersionIds[0];assert.ok(existsSync(join(cwd,'skills',skillId,'references','decisions.md')));assert.equal(readFileSync(join(cwd,'skills',skillId,'SKILL.md'),'utf8'),store.get('versions',skillId).text);});
test('summary standards cannot silently become formal evaluation inputs',t=>{const {store}=context(t);const standard=addVersion(store,{projectId:'default',kind:'standard',title:'Synthetic incomplete summary',text:'This is an incomplete synthetic summary.',metadata:{representation:'historical_summary'}});const task=createTask(store,{projectId:'default',intent:'evaluate'});const contract=compileContract(store,task,{text:'评测'},resolveRefs(store,task,[{versionId:standard.id}]));assert.ok(contract.openQuestions.some(x=>x.includes('历史标准摘要')));});
test('uploaded ZIP retains archive, validates paths, mounts references only when selected',t=>{const {store}=context(t);const bytes=archive([{path:'own/SKILL.md',text:'---\nname: own\ndescription: own method\n---\nRead references/rule.md'},{path:'own/references/rule.md',text:'User rule, no automatic execution'}]);const version=addVersion(store,{projectId:'default',kind:'skill',title:'自己的技能',fileName:'own.zip',mime:'application/zip',contentBase64:bytes.toString('base64')});assert.equal(version.metadata.enabled,false);assert.equal(version.metadata.packageValidated,true);assert.deepEqual(store.blobBytes(version.hash),bytes);assert.equal(store.list('runs').length,0);const task=createTask(store,{projectId:'default',intent:'standard'});const contract=compileContract(store,task,{text:'使用选中技能'},resolveRefs(store,task,[{versionId:version.id}]));const cwd=new Runtime(store,process.cwd()).workspace(task,{id:'fixture'},contract);assert.equal(readFileSync(join(cwd,'skills',version.id,'references/rule.md'),'utf8'),'User rule, no automatic execution');});
test('ZIP traversal and symlink are rejected without extraction',t=>{const {store}=context(t);for(const file of [{path:'../outside',text:'bad'},{path:'own/link',text:'/etc/passwd',symlink:true}]){const bytes=archive([{path:'own/SKILL.md',text:'---\nname: own\ndescription: test\n---'},file]);assert.throws(()=>addVersion(store,{projectId:'default',kind:'skill',title:'bad',fileName:'bad.zip',mime:'application/zip',contentBase64:bytes.toString('base64')}),/拒绝导入/);}assert.equal(store.list('versions').length,0);});
test('generated scoring is a new batch with lineage; analysis cannot register a scoring batch',t=>{
  const {store}=context(t);const runtime=new Runtime(store,process.cwd());
  for(const intent of ['evaluate','analyze']){
    const task=createTask(store,{projectId:'default',intent});const contract=compileContract(store,task,{text:'Synthetic lineage check'},[]);store.insert('contracts',contract,task.id);
    const run={id:intent,contractId:contract.id,taskId:task.id};const cwd=runtime.workspace(task,run,contract);
    writeFileSync(join(cwd,'outputs','scores.json'),JSON.stringify([{caseId:'one',verdict:'满足',scale:'原生三档'}]));writeFileSync(join(cwd,'outputs','manifest.json'),JSON.stringify({artifacts:[{path:'scores.json',kind:'scoring_batch',title:'合成评分'}]}));
    runtime.collect(task,run,cwd);
  }
  const scoring=store.list('versions').filter(v=>v.kind==='scoring_batch');assert.equal(scoring.length,1);assert.equal(scoring[0].metadata.origin,'generated');assert.equal(scoring[0].metadata.runId,'evaluate');assert.equal(scoring[0].metadata.recordCount,1);assert.equal(store.list('artifacts').length,2);
});


test('skill ZIP rejects case aliases, Unicode aliases and file-directory collisions',t=>{
 const {store}=context(t);const main={path:'SKILL.md',text:'---\nname: own\ndescription: own\n---\nOriginal'};
 for(const files of [[main,{path:'skill.md',text:'Overwrite'}],[main,{path:'refs/é.md',text:'a'},{path:'refs/e\u0301.md',text:'b'}],[main,{path:'refs',text:'file'},{path:'REFS/a.md',text:'nested'}]]){
  const bytes=archive(files);assert.throws(()=>addVersion(store,{projectId:'default',kind:'skill',title:'Synthetic collision',fileName:'skill.zip',contentBase64:bytes.toString('base64')}),/重复路径|路径冲突/);
 }
 assert.equal(store.list('versions').length,0);
});

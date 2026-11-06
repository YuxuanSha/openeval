import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../server/store.ts';
import {checkWorkspace} from '../desktop/check-workspace.mjs';
function directory(t:any){const dir=mkdtempSync(join(tmpdir(),'openeval-workspace-check-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
test('workspace selection accepts a closed existing store without changing its database',t=>{
  const dir=directory(t),store=new Store(dir);store.put('tasks',{id:'existing',title:'Synthetic saved task'},'default');store.close();const file=join(dir,'openeval.sqlite'),before=readFileSync(file);assert.deepEqual(checkWorkspace(dir),{ok:true});assert.deepEqual(readFileSync(file),before);
});
test('workspace selection rejects another SQLite application without creating OpenEval tables',t=>{
  const dir=directory(t);mkdirSync(join(dir,'blobs'));const file=join(dir,'openeval.sqlite'),db=new DatabaseSync(file);db.exec('CREATE TABLE unrelated(id TEXT)');db.close();const before=readFileSync(file);assert.throws(()=>checkWorkspace(dir),/不是已有/);assert.deepEqual(readFileSync(file),before);const check=new DatabaseSync(file,{readOnly:true});assert.deepEqual(check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name),['unrelated']);check.close();
});
test('workspace selection never initializes an empty or corrupt directory',t=>{
  const dir=directory(t);mkdirSync(join(dir,'blobs'));const file=join(dir,'openeval.sqlite');assert.throws(()=>checkWorkspace(dir));assert.equal(existsSync(file),false);writeFileSync(file,'synthetic invalid database');assert.throws(()=>checkWorkspace(dir));assert.equal(readFileSync(file,'utf8'),'synthetic invalid database');assert.throws(()=>checkWorkspace('relative'));
});

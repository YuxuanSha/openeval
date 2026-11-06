import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hash } from '../server/store.ts';
import { verifyPackage } from '../scripts/verify-package.mjs';
import { auditFiles } from '../scripts/release-audit.mjs';
test('distribution verification detects edits, additions, omissions, traversal and symlinks',t=>{
 const root=mkdtempSync(join(tmpdir(),'openeval-package-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const manifest={files:[{path:'file.txt',sha256:hash('original')}]};const save=()=>writeFileSync(join(root,'MANIFEST.json'),JSON.stringify(manifest));save();writeFileSync(join(root,'file.txt'),'original');assert.equal(verifyPackage(root).files,1);
 writeFileSync(join(root,'file.txt'),'changed');assert.throws(()=>verifyPackage(root),/mismatch/);writeFileSync(join(root,'file.txt'),'original');writeFileSync(join(root,'extra.txt'),'extra');assert.throws(()=>verifyPackage(root),/Unlisted/);rmSync(join(root,'extra.txt'));rmSync(join(root,'file.txt'));assert.throws(()=>verifyPackage(root),/missing/);
 symlinkSync('/dev/null',join(root,'file.txt'));assert.throws(()=>verifyPackage(root),/Symlink/);rmSync(join(root,'file.txt'));manifest.files[0].path='../file.txt';save();assert.throws(()=>verifyPackage(root),/Unsafe/);
});
test('release audit reports sensitive file paths and credential rules without matched values',t=>{
 const root=mkdtempSync(join(tmpdir(),'openeval-audit-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'sessions'));writeFileSync(join(root,'sessions','private.json'),'{}');writeFileSync(join(root,'bad.txt'),'sk-'+'x'.repeat(40));const audit=auditFiles(root,['sessions/private.json','bad.txt']);assert.equal(audit.ok,false);assert.ok(audit.findings.some(f=>f.rule==='private-file'));assert.ok(audit.findings.some(f=>f.rule==='credential'));assert.equal(JSON.stringify(audit).includes('x'.repeat(40)),false);
});

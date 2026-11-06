import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyPackage(directory) {
  const root=resolve(directory);const manifestPath=join(root,'MANIFEST.json');
  if(lstatSync(root).isSymbolicLink()||lstatSync(manifestPath).isSymbolicLink())throw new Error('Package root and manifest must not be symlinks');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  if(!Array.isArray(manifest.files)||!manifest.files.length)throw new Error('Missing package file manifest');
  const expected=new Map();
  for(const f of manifest.files){if(typeof f.path!=='string'||/[:\\\x00-\x1f]/.test(f.path)||f.path.startsWith('/')||f.path.split('/').some(p=>!p||p==='.'||p==='..')||! /^[a-f0-9]{64}$/.test(f.sha256)||expected.has(f.path))throw new Error('Unsafe or duplicate manifest entry');expected.set(f.path,f.sha256);}
  let checked=0;
  function walk(dir){for(const name of readdirSync(dir)){const file=join(dir,name),stat=lstatSync(file),path=relative(root,file);if(stat.isSymbolicLink())throw new Error(`Symlink in package: ${path}`);if(stat.isDirectory()){walk(file);continue;}if(!stat.isFile())throw new Error(`Special file in package: ${path}`);if(path==='MANIFEST.json')continue;if(!expected.has(path))throw new Error(`Unlisted file in package: ${path}`);if(createHash('sha256').update(readFileSync(file)).digest('hex')!==expected.get(path))throw new Error(`Hash mismatch: ${path}`);checked++;}}
  walk(root);if(checked!==expected.size)throw new Error('Package file missing');return {ok:true,files:checked};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{if(!process.argv[2])throw new Error('Usage: node scripts/verify-package.mjs <package-directory>');console.log(JSON.stringify(verifyPackage(process.argv[2])));}catch(e){console.error(e.message);process.exitCode=1;}}

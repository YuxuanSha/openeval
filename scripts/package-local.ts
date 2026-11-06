// Local packaging only. This does not upload, publish, or install anything.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { auditFiles } from './release-audit.mjs';
import { verifyPackage } from './verify-package.mjs';
const root=resolve(import.meta.dirname,'..');
const allowed=['server','shared','bin','client','dist','npm-shrinkwrap.json','tsconfig.json','tsconfig.package.json','assets/builtin-skills','web/dist','desktop','package.json','README.md','README.zh-CN.md','API-CONTRACT.txt','Start OpenEval.command','Stop OpenEval.command','scripts/local-service.mjs','scripts/build-macos.sh','scripts/check-interface-package.mjs','LICENSE','THIRD_PARTY_NOTICES.md','LICENSES','web/third_party/opendesign','web/OPENDESIGN_REFERENCE.md','docs'];
if(!existsSync(join(root,'dist/server/index.js')))throw new Error('Build the backend with npm run build:server before packaging');
if(!existsSync(join(root,'web/dist/index.html')))throw new Error('Build the final frontend before packaging');
const files:string[]=[];
function walk(path:string){const stat=lstatSync(path);if(stat.isSymbolicLink())throw new Error(`Package cannot include symlink: ${path}`);if(stat.isDirectory()){for(const name of readdirSync(path))walk(join(path,name));}else files.push(path);}
for(const item of allowed)walk(join(root,item));
for(const item of ['scripts/release-audit.mjs','scripts/verify-package.mjs']){allowed.push(item);walk(join(root,item));}
const audit=auditFiles(root,files.map(file=>relative(root,file)));if(!audit.ok)throw new Error(`Release audit failed: ${JSON.stringify(audit.findings)}`);
for(const file of files){if(!/\.(?:mjs|js|json|html|md|txt|ts|css|svg|swift|sh)$/.test(file))continue;const content=readFileSync(file,'utf8');if(/\/Users\/|libfile_[a-z0-9]+|https?:\/\/[^\s]+\.(?:feishu\.cn|larkoffice\.com)\/|-----BEGIN [A-Z ]*PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{20}/.test(content))throw new Error(`Private fixture marker remains in distribution input: ${relative(root,file)}. Rebuild the generic frontend first; no package created.`);}
const output=join(root,'release',`openeval-${new Date().toISOString().replace(/[:.]/g,'-')}`);mkdirSync(output,{recursive:true});
for(const item of allowed)cpSync(join(root,item),join(output,item),{recursive:true});
const manifest=files.map(file=>({path:relative(root,file),sha256:createHash('sha256').update(readFileSync(file)).digest('hex')}));
writeFileSync(join(output,'MANIFEST.json'),JSON.stringify({schemaVersion:1,createdAt:new Date().toISOString(),privateDataIncluded:false,files:manifest},null,2));
verifyPackage(output);
console.log(output);

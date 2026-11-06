import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Report paths and rule names only; never print matched credentials or private content. */
export function auditFiles(root,paths){
  const findings=[];
  const privatePath=/(^|\/)(?:\.env(?!\.example$)[^/]*|\.openeval[^/]*|\.runtime|\.aws|\.codex|\.agents|evidence|archives|private-inputs|sessions|auth\.json|credentials\.json)(?:\/|$)|\.(?:sqlite(?:-.*)?|db(?:-.*)?|pem|key)$/i;
  for(const path of paths){
    if(privatePath.test(path))findings.push({path,rule:'private-file'});
    const file=join(root,path);if(!existsSync(file)){findings.push({path,rule:'missing-file'});continue;}const stat=lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()){findings.push({path,rule:'non-regular-file'});continue;}
    if(!/\.(?:ts|tsx|js|mjs|json|md|txt|html|css|svg|swift|py|sh|command)$/i.test(path))continue;
    const source=readFileSync(file,'utf8');
    const patterns=[['credential',/(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{24,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{20})/],['private-source',/libfile_[a-z0-9]{8,}|https?:\/\/[^\s"'<>]*\.(?:feishu\.cn|larkoffice\.com)\/(?:docx|wiki|sheets|base)\/[a-zA-Z0-9]{8,}/],['personal-absolute-path',/\/(?:Users|home)\/[A-Za-z0-9._-]+\/(?:Documents|Desktop|Downloads|\.codex|\.aws)\//]];
    for(const [rule,pattern] of patterns)if(pattern.test(source))findings.push({path,rule});
  }
  const notices=['LICENSE','THIRD_PARTY_NOTICES.md','web/third_party/opendesign/LICENSE','web/third_party/opendesign/NOTICE.md','LICENSES/markdown-dependencies/INDEX.json'];
  for(const path of notices)if(!paths.includes(path)||!existsSync(join(root,path)))findings.push({path,rule:'missing-license-notice'});
  return {ok:findings.length===0,files:paths.length,findings,limitations:['Pattern checks do not prove anonymization or legal clearance.','Review images, new third-party code and the exact final commit/package before publishing.']};
}
export function treeFiles(root){const files=[];function walk(dir){for(const name of readdirSync(join(root,dir))){const path=dir?`${dir}/${name}`:name;const stat=lstatSync(join(root,path));if(stat.isDirectory()&&!stat.isSymbolicLink())walk(path);else files.push(path);}}walk('');return files;}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const tree=process.argv[2]==='--tree';if(tree&&!process.argv[3])throw new Error('Usage: release-audit.mjs --tree <directory>');const root=tree?resolve(process.argv[3]):resolve(import.meta.dirname,'..');const paths=tree?treeFiles(root):execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);const result=auditFiles(root,paths);console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}

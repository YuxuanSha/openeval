import { spawnSync } from 'node:child_process';
import { AppError } from './store.ts';
import { validateBundlePaths } from './bundle-paths.ts';
// This parser only reads an archive in memory. It never imports/runs package code.
const parser = `import sys,io,zipfile,json,base64,posixpath,stat
try:
 z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
 items=z.infolist()
 if len(items)>500: raise ValueError('技能包文件过多')
 if sum(i.file_size for i in items)>40*1024*1024: raise ValueError('技能包解压后超过40MB')
 paths=set()
 for i in items:
  p=i.filename
  if not p or p.startswith('/') or '\\\\' in p or ':' in p or '..' in p.split('/') or '\\x00' in p: raise ValueError('技能包包含越界路径')
  if p in paths: raise ValueError('技能包包含重复路径')
  paths.add(p)
  mode=(i.external_attr>>16)&0o170000
  if mode not in (0,stat.S_IFREG,stat.S_IFDIR): raise ValueError('技能包不允许符号链接或特殊文件')
  if i.flag_bits&1: raise ValueError('不支持加密技能包')
 roots=[p[:-len('SKILL.md')] for p in paths if p.endswith('SKILL.md') and (p=='SKILL.md' or p[-9]=='/')]
 if len(roots)!=1: raise ValueError('技能包必须包含唯一的SKILL.md')
 root=roots[0]
 if any(not i.filename.startswith(root) for i in items): raise ValueError('文件必须位于同一技能目录')
 files=[]
 for i in items:
  if i.is_dir(): continue
  p=i.filename[len(root):]
  if p.startswith('/') or not p: raise ValueError('无效技能路径')
  b=z.read(i)
  files.append({'path':p,'base64':base64.b64encode(b).decode()})
 print(json.dumps({'files':files}))
except Exception as e:
 print(json.dumps({'error':str(e)})); sys.exit(1)
`;
export function readSkillArchive(bytes:Buffer){
  const result=spawnSync('/usr/bin/python3',['-c',parser],{input:bytes,maxBuffer:80*1024*1024,timeout:15000});let value:any;if(result.error)throw new AppError(503,'SKILL_PARSER_UNAVAILABLE','技能 ZIP 解析器不可用：需要可执行的 /usr/bin/python3；可改为导入 SKILL.md。');try{value=JSON.parse(result.stdout?.toString()??'');}catch{throw new AppError(400,'SKILL_ARCHIVE','技能包读取失败');}
  if(result.status!==0||value.error)throw new AppError(400,'SKILL_ARCHIVE',`技能包拒绝导入：${value.error??'无效归档'}`);
  const files=value.files.map((f:any)=>({path:f.path,bytes:Buffer.from(f.base64,'base64')}));validateBundlePaths(files.map((f:any)=>f.path));const skill=files.find((f:any)=>f.path==='SKILL.md');if(!skill)throw new AppError(400,'SKILL_ARCHIVE','技能包缺少SKILL.md');return {files,skillText:skill.bytes.toString('utf8')};
}

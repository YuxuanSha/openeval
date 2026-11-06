import { AppError } from './store.ts';

// Package files will be mounted on case-insensitive macOS volumes. Reject aliases
// before writing any of them, including canonically equivalent Unicode names.
export function validateBundlePaths(paths:string[]) {
  const files=new Set<string>();
  for(const path of paths){
    if(typeof path!=='string'||!path||/[\\:\x00-\x1f]/.test(path)||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new AppError(400,'SKILL_ARCHIVE','技能附件路径无效');
    const key=path.normalize('NFC').toLowerCase();
    if(files.has(key))throw new AppError(400,'SKILL_ARCHIVE','技能附件包含大小写或 Unicode 等价的重复路径');
    files.add(key);
  }
  for(const path of files){const parts=path.split('/');parts.pop();while(parts.length){if(files.has(parts.join('/')))throw new AppError(400,'SKILL_ARCHIVE','技能附件的文件和目录路径冲突');parts.pop();}}
}

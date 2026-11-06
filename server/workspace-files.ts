import {constants,closeSync,fstatSync,lstatSync,mkdirSync,openSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AppError} from './store.ts';
const unsafe=()=>new AppError(409,'WORKSPACE_PATH','工作路径包含链接或非普通文件；已停止准备，请检查任务文件。');
/** Agent-writable workspaces are untrusted. Never follow links while mounting context. */
export function workspaceDirectory(root:string,path:string){
 const base=resolve(root),target=resolve(path),rel=relative(base,target);
 if(rel==='..'||rel.startsWith('../')||isAbsolute(rel))throw unsafe();
 const segments=[base,...rel.split('/').filter(Boolean).map((_,i,a)=>join(base,...a.slice(0,i+1)))];
 for(const segment of segments){try{mkdirSync(segment);}catch(e){if((e as any).code!=='EEXIST')throw e;}const stat=lstatSync(segment);if(stat.isSymbolicLink()||!stat.isDirectory())throw unsafe();}
 return target;
}
export function writeWorkspaceFile(root:string,path:string,bytes:string|Buffer){
 workspaceDirectory(root,dirname(path));
 try{const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw unsafe();}catch(e){if((e as any).code!=='ENOENT')throw e;}
 const temporary=join(dirname(path),`.openeval-write-${randomUUID()}`);let fd:number|undefined;
 try{fd=openSync(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);if(!fstatSync(fd).isFile())throw unsafe();writeFileSync(fd,bytes);closeSync(fd);fd=undefined;workspaceDirectory(root,dirname(path));renameSync(temporary,path);}finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(temporary);}catch(e){if((e as any).code!=='ENOENT')throw e;}}
}
/** Read an existing mounted input without repairing missing paths or following links. */
export function inspectWorkspaceFile(root:string,path:string){
 const base=resolve(root),target=resolve(path),rel=relative(base,target);if(rel==='..'||rel.startsWith('../')||isAbsolute(rel))throw unsafe();
 const rootStat=lstatSync(base);if(rootStat.isSymbolicLink()||!rootStat.isDirectory())throw unsafe();
 const parts=rel.split('/').filter(Boolean);for(let i=0;i<parts.length;i++){const item=join(base,...parts.slice(0,i+1));const stat=lstatSync(item);if(stat.isSymbolicLink()||(i<parts.length-1?!stat.isDirectory():!stat.isFile()||stat.nlink!==1))throw unsafe();}return target;
}

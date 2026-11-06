import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Store, hash } from './store.ts';
import { addVersion } from './domain.ts';
const routes:Record<string,string>={
  'openeval-standard-builder':'standard','openeval-dataset-builder':'dataset',
  'openeval-agile-evaluator':'evaluate','openeval-machine-result-analyst':'analyze',
  'openeval-report-writer':'report'
};
const assetRoot=(root:string)=>join(root,'assets','openeval-workflow-assets');
export function seedAssets(store:Store,root:string){
  const folder=join(root,'assets','builtin-skills');if(!existsSync(folder))return;
  for(const entry of readdirSync(folder,{withFileTypes:true})){if(!entry.isDirectory()||!routes[entry.name])continue;const directory=join(folder,entry.name);const skillPath=join(directory,'SKILL.md');if(!existsSync(skillPath))continue;
    const skill=readFileSync(skillPath,'utf8');const files:any[]=[];const walk=(path:string)=>{for(const child of readdirSync(path,{withFileTypes:true})){if(child.isSymbolicLink())continue;const file=join(path,child.name);if(child.isDirectory())walk(file);else{const bytes=readFileSync(file);files.push({path:relative(directory,file),hash:store.blob(bytes)});}}};walk(directory);files.sort((a,b)=>a.path.localeCompare(b.path));const bundleHash=hash(JSON.stringify(files));
    const old=store.list('versions','default').filter(v=>v.source.type==='builtin'&&v.metadata.builtinKey===entry.name).at(-1);if(old?.metadata.bundleHash===bundleHash)continue;
    addVersion(store,{projectId:'default',kind:'skill',title:{standard:'评测标准构建',dataset:'评测集构建',evaluate:'敏捷评测',analyze:'已有机评结果分析',report:'评测报告撰写'}[routes[entry.name]],fileName:'SKILL.md',mime:'text/markdown',text:skill,versionLabel:'内置 1.1',metadata:{builtinKey:entry.name,intent:routes[entry.name],bundleHash,bundleFiles:files}},old?.resourceId,{type:'builtin',name:'SKILL.md'});
  }
}
export function importHistoricalAssets(store:Store,root:string,projectId='default'){
  store.get('projects',projectId);const assetFolder=assetRoot(root);
  const imports=join(assetFolder,'integration','resource-imports.json');if(existsSync(imports))for(const row of JSON.parse(readFileSync(imports,'utf8')).imports){const payload=row.payload;const old=store.list('versions',projectId).filter(v=>v.metadata.bundleId===payload.metadata.bundleId&&v.metadata.sourceAssetId===row.sourceAssetId).at(-1);if(old?.hash===hash(payload.text))continue;addVersion(store,{...payload,projectId,fileName:`${row.sourceAssetId}.json`},old?.resourceId,{type:'historical',name:`${row.sourceAssetId}.json`});}
}
export function showcaseBundle(root:string,enabled=false){
  if(!enabled)return {cases:[],resources:[],historical:false,executionPerformed:false};
  const folder=assetRoot(root);const manifestPath=join(folder,'manifest.json');if(!existsSync(manifestPath))return {cases:[],resources:[],historical:true};
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const safeRead=(path:string)=>{if(path.includes('..')||path.startsWith('/'))throw new Error('Invalid showcase path');return JSON.parse(readFileSync(join(folder,path),'utf8'));};
  return {historical:true,executionPerformed:false,cases:(manifest.entrypoints?.showcases??[]).map(safeRead),resources:safeRead(manifest.entrypoints.resources)};
}

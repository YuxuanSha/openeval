// Read-only identity check before a desktop user selects an existing data directory.
import {DatabaseSync} from 'node:sqlite';
import {isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {statSync} from 'node:fs';

export function checkWorkspace(directory) {
  if(typeof directory!=='string'||!isAbsolute(directory))throw Error('工作区路径必须是绝对路径');
  if(!statSync(join(directory,'blobs')).isDirectory())throw Error('缺少 blobs 文件夹');
  let db;
  try {
    db=new DatabaseSync(join(directory,'openeval.sqlite'),{readOnly:true});
    const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
    for(const name of ['projects','tasks','messages','versions','runs','artifacts','events'])if(!names.has(name))throw Error('目录中不是已有的 OpenEval 数据库');
    for(const name of ['projects','tasks','messages','versions','runs','artifacts']) {
      const columns=new Set(db.prepare(`PRAGMA table_info(${name})`).all().map(row=>row.name));
      for(const column of ['id','scope','body'])if(!columns.has(column))throw Error('工作区数据库结构不兼容');
    }
    return {ok:true};
  } finally {db?.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{console.log(JSON.stringify(checkWorkspace(process.argv[2])));}
  catch{console.log(JSON.stringify({ok:false,message:'目录不是可读取的 OpenEval 工作区，或数据库结构不兼容。没有修改所选目录。'}));process.exitCode=1;}
}

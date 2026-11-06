import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export class AppError extends Error {
  status: number; code: string; details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}
const tables = new Set(['projects','tasks','messages','contracts','runs','versions','artifacts','memories','memory_history','requests']);
export class Store {
  db: DatabaseSync; root: string;
  constructor(root: string) {
    this.root = root; mkdirSync(root, { recursive: true });
    for (const part of ['blobs','workspaces']) mkdirSync(join(root, part), { recursive: true });
    this.db = new DatabaseSync(join(root,'openeval.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
    for (const table of tables) this.db.exec(`CREATE TABLE IF NOT EXISTS ${table}(id TEXT PRIMARY KEY, scope TEXT NOT NULL, body TEXT NOT NULL)`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, run_id TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_task ON events(task_id,id);
      CREATE TABLE IF NOT EXISTS submissions(task_id TEXT NOT NULL, request_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(task_id,request_id));
      CREATE TABLE IF NOT EXISTS records(version_id TEXT NOT NULL, record_id TEXT NOT NULL, row_index INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(version_id,record_id));`);
    if (!this.list('projects').length) this.put('projects',{id:'default',name:'我的评测空间',createdAt:now()},'default');
  }
  recoverInterruptedRuns(){
    for (const run of this.list('runs')) if ((['queued','running'].includes(run.status)||(run.status==='waiting'&&this.list('requests',run.taskId).some(request=>request.runId===run.id&&request.status==='pending')))) {
      this.put('runs',{...run,status:'interrupted',error:'应用重启，运行已保留。可继续或重试。',updatedAt:now()},run.taskId);
      this.event(run.taskId,run.id,'run.status',{status:'interrupted'});
    }
    for (const request of this.list('requests')) if (request.status==='pending') this.put('requests',{...request,status:'expired'},request.taskId);
  }
  table(name: string) { if (!tables.has(name)) throw new Error('Unknown table'); return name; }
  get(name: string, key: string, required=true): any {
    const row = this.db.prepare(`SELECT body FROM ${this.table(name)} WHERE id=?`).get(key) as any;
    if (!row && required) throw new AppError(404,'NOT_FOUND','记录不存在');
    return row ? JSON.parse(row.body) : null;
  }
  list(name: string, scope?: string): any[] {
    const statement = this.db.prepare(`SELECT body FROM ${this.table(name)}${scope===undefined?'':' WHERE scope=?'} ORDER BY rowid`);
    const rows = (scope===undefined ? statement.all() : statement.all(scope)) as any[];
    return rows.map(row=>JSON.parse(row.body));
  }
  put(name: string, value: any, scope: string) {
    this.db.prepare(`INSERT INTO ${this.table(name)}(id,scope,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET scope=excluded.scope,body=excluded.body`).run(value.id,scope,JSON.stringify(value)); return value;
  }
  insert(name: string,value:any,scope:string) {
    this.db.prepare(`INSERT INTO ${this.table(name)}(id,scope,body) VALUES(?,?,?)`).run(value.id,scope,JSON.stringify(value));return value;
  }
  transaction<T>(fn:()=>T):T { this.db.exec('BEGIN IMMEDIATE');try {const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;} }
  blob(bytes: Buffer) {const digest=hash(bytes);writeFileSync(join(this.root,'blobs',digest),bytes,{flag:'w',mode:0o600});return digest;}
  blobBytes(digest:string) {if(!/^[a-f0-9]{64}$/.test(digest))throw new AppError(400,'BAD_HASH','无效文件标识');return readFileSync(join(this.root,'blobs',digest));}
  event(taskId:string,runId:string,kind:string,data:any) {
    const createdAt=now();const result=this.db.prepare('INSERT INTO events(task_id,run_id,kind,data,created_at) VALUES(?,?,?,?,?)').run(taskId,runId,kind,JSON.stringify(data),createdAt);
    return {id:Number(result.lastInsertRowid),taskId,runId,kind,data,createdAt};
  }
  events(taskId:string,after=0) {return (this.db.prepare('SELECT * FROM events WHERE task_id=? AND id>? ORDER BY id LIMIT 1000').all(taskId,after) as any[]).map(row=>({id:row.id,taskId:row.task_id,runId:row.run_id,kind:row.kind,data:JSON.parse(row.data),createdAt:row.created_at}));}
  receipt(taskId:string,key:string) {const row=this.db.prepare('SELECT body FROM submissions WHERE task_id=? AND request_id=?').get(taskId,key) as any;return row?JSON.parse(row.body):null;}
  assistantEvents(taskId:string) {
    return (this.db.prepare(`SELECT * FROM events WHERE task_id=? AND (kind='assistant.delta' OR (kind IN ('tool.started','tool.completed') AND json_extract(data,'$.item.type')='agentMessage')) ORDER BY id`).all(taskId) as any[])
      .map(row=>({id:row.id,taskId:row.task_id,runId:row.run_id,kind:row.kind,data:JSON.parse(row.data),createdAt:row.created_at}));
  }
  saveReceipt(taskId:string,key:string,value:any) {this.db.prepare('INSERT INTO submissions VALUES(?,?,?)').run(taskId,key,JSON.stringify(value));}
  records(versionId:string,offset=0,limit=100) {return (this.db.prepare('SELECT body FROM records WHERE version_id=? ORDER BY row_index LIMIT ? OFFSET ?').all(versionId,limit,offset) as any[]).map(row=>JSON.parse(row.body));}
  *iterateRecords(versionId:string) {for(const row of this.db.prepare('SELECT body FROM records WHERE version_id=? ORDER BY row_index').iterate(versionId))yield JSON.parse(String(row.body));}
  saveRecords(versionId:string,rows:Iterable<any>) {const stmt=this.db.prepare('INSERT INTO records VALUES(?,?,?,?)');let index=0;for(const row of rows)stmt.run(versionId,row.recordId,index++,JSON.stringify(row));}
  close(){this.db.close();}
}

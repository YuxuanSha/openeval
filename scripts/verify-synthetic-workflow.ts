// Read-only verification of the explicitly synthetic browser acceptance session.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const base=process.env.OPENEVAL_VERIFY_URL??'http://127.0.0.1:4335';
const taskId=process.env.OPENEVAL_VERIFY_TASK;
if(!taskId)throw new Error('Set OPENEVAL_VERIFY_TASK to the synthetic session');
async function get(path:string){const r=await fetch(base+'/api'+path);if(!r.ok)throw new Error(`${r.status}: ${await r.text()}`);return r.json();}
let detail:any;const limit=Date.now()+180000;
while(Date.now()<limit){detail=await get('/tasks/'+taskId);if(detail.runs.length>=5&&detail.runs.every((r:any)=>!['queued','running','waiting'].includes(r.status)))break;await new Promise(r=>setTimeout(r,1000));}
assert.equal(detail.runs.length,5);assert.ok(detail.runs.every((r:any)=>r.status==='completed'));
const resources=(await get('/resources?projectId=default')).resources;const generated=resources.filter((v:any)=>v.metadata.taskId===taskId);
const one=(kind:string)=>{const row=generated.find((v:any)=>v.kind===kind);assert.ok(row,kind+' missing');return row;};
const standard=one('standard'),dataset=one('dataset'),outputs=one('artifact_batch'),scores=one('scoring_batch');
assert.equal(standard.title,'合成回声标准');assert.equal(dataset.metadata.recordCount,2);assert.equal(outputs.metadata.recordCount,2);assert.equal(scores.metadata.recordCount,2);
assert.equal(dataset.version,2);assert.equal(outputs.version,2);
const records=await get(`/versions/${scores.id}/records?limit=100`);const rows=records.records.map((r:any)=>r.raw);
assert.deepEqual(rows.map((r:any)=>r.judgment??r.verdict??r.result),['满足','未满足']);
assert.equal(generated.filter((r:any)=>r.kind==='scoring_batch').length,1);
const report=generated.find((r:any)=>r.title==='合成回声最终验收报告');assert.ok(report);
const full=await get('/versions/'+report.id);assert.deepEqual(full.text.split('\n').filter((s:string)=>/^# /.test(s)),['# 本次结论','# 逐条证据','# 证据边界']);
const template=resources.find((r:any)=>r.title==='合成验收三章模板');assert.ok(report.metadata.templateVersionIds.includes(template.id));
const reportContract=detail.contracts.find((c:any)=>c.id===report.metadata.contractId);assert.ok(reportContract.refs.some((r:any)=>r.versionId===scores.id&&r.hash===scores.hash));
assert.equal(new Set(detail.runs.map((r:any)=>r.threadId)).size,1);
assert.ok(detail.runs.every((r:any)=>r.archive.errors.length===0));
const oldDataset=(await get(`/resources/${dataset.resourceId}/versions`)).versions;assert.equal(oldDataset.length,2);assert.notEqual(oldDataset[0].hash,oldDataset[1].hash);
const evidence={checkedAt:new Date().toISOString(),syntheticOnly:true,actualBusinessDataUsed:false,taskId,success:true,runs:detail.runs.map((r:any)=>({id:r.id,intent:detail.contracts.find((c:any)=>c.id===r.contractId).intent,status:r.status,threadId:r.threadId,archive:r.archive})),resources:generated.map((r:any)=>({id:r.id,resourceId:r.resourceId,kind:r.kind,title:r.title,hash:r.hash,version:r.version,records:r.metadata.recordCount})),scoringRows:rows,report:full.text,template:{id:template.id,hash:template.hash},knownIssueFixed:'First artifact container artifacts[] was initially stored with zero indexed rows; parser fixed and a visible new immutable version indexed both rows. Original bytes retained. No private data submitted.'};
writeFileSync('evidence/v3-full-workflow.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({success:true,runs:evidence.runs.length,resources:evidence.resources.length,reportTitle:report.title}));

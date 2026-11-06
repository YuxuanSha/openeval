// Opt-in real-Codex acceptance, only synthetic inputs and a new temporary store.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const { values } = parseArgs({ options: { live: { type: 'boolean' }, bin: { type: 'string' }, output: { type: 'string' } } });
if (!values.live) throw Error('This smoke test invokes the signed-in Codex runtime. Explicitly pass --live.');
const bin = resolve(values.bin ?? 'bin/openeval.mjs');
const directory = await mkdtemp(join(tmpdir(), 'openeval-live-interfaces-'));
let url, mcp, service, currentRun, taskId;
async function cli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args, ...(url ? ['--url', url] : [])], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', bytes => stdout += bytes); child.stderr.on('data', bytes => stderr += bytes);
    child.once('error', reject); child.once('close', code => {
      if (code) reject(Error(`CLI ${args[0]} ${args[1] ?? ''} exited ${code}: ${stderr || stdout}`));
      else { try { resolve(JSON.parse(stdout)); } catch { reject(Error(`Unexpected CLI output: ${stdout}`)); } }
    });
  });
}
try {
  service = spawn(process.execPath, [bin, 'serve', '--port', '0', '--data-dir', join(directory, 'data')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; service.stderr.on('data', bytes => logs += bytes);
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Service startup timeout')), 15000);
    const lines = createInterface({ input: service.stdout });
    lines.on('line', line => { try { const value = JSON.parse(line); if (value.status === 'ready') { clearTimeout(timer); resolve(value); } } catch {} });
    service.once('error', error => { clearTimeout(timer); reject(error); });
    service.once('exit', code => { clearTimeout(timer); reject(Error(`Service exited ${code}: ${logs}`)); });
  });
  url = ready.url;
  const runtime = await cli(['runtime']); assert.equal(runtime.available, true); assert.equal(runtime.authenticated, true);
  const standardFile = join(directory, 'standard.md'), samplesFile = join(directory, 'outputs.json');
  await writeFile(standardFile, '# Synthetic exact-match evaluation\nFor each existing record, compare actual with expected as exact case-sensitive strings. Give score 1 if equal and 0 otherwise. Preserve IDs. Do not generate new outputs, use weights or report a percentage.\n');
  await writeFile(samplesFile, JSON.stringify([{ id: 'synthetic-1', expected: 'alpha', actual: 'alpha' }, { id: 'synthetic-2', expected: 'beta', actual: 'wrong' }]));
  const standard = await cli(['resource', 'import', '--file', standardFile, '--kind', 'standard', '--title', 'Synthetic exact-match standard']);
  const outputs = await cli(['resource', 'import', '--file', samplesFile, '--kind', 'artifact_batch', '--title', 'Synthetic existing outputs']);
  const task = await cli(['task', 'create', '--intent', 'evaluate', '--title', 'Synthetic real CLI and MCP acceptance', '--request-id', 'live-interface-create']); taskId = task.id;
  mcp = new Client({ name: 'openeval-live-acceptance', version: '1.0.0' });
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [bin, 'mcp', '--url', url, '--allow-write'], stderr: 'pipe' }));
  const result = await mcp.callTool({ name: 'openeval_task_submit', arguments: {
    taskId, requestId: 'live-interface-evaluate', intent: 'evaluate',
    refs: [{ versionId: standard.id, hash: standard.hash }, { versionId: outputs.id, hash: outputs.hash }],
    text: 'Apply the referenced exact-match standard to the two referenced existing synthetic outputs. Read the full standard and records. Write scores.json as a JSON array with id, expected, actual, score, evidence for each record, and a concise report.md. Register them in the current run manifest as scoring_batch and report following openeval-context.json. Do not generate outputs, add weights, run network tools, use Feishu, or change credentials. Verify scores are exactly 1 and 0 and preserve IDs. This is a synthetic interface acceptance, not business-data validation.',
  } });
  assert.ok(!result.isError, JSON.stringify(result)); currentRun = result.structuredContent.run.id;
  const waited = await cli(['task', 'wait', taskId, '--run-id', currentRun, '--wait-ms', '180000']); assert.equal(waited.run.status, 'completed');
  const detailResult = await mcp.callTool({ name: 'openeval_task_get', arguments: { taskId } }); assert.ok(!detailResult.isError); const detail = detailResult.structuredContent;
  assert.equal(detail.contracts[0].refs[0].hash, standard.hash); assert.equal(detail.contracts[0].refs[1].hash, outputs.hash);
  const scoresArtifact = detail.artifacts.find(a => basename(a.name) === 'scores.json'), reportArtifact = detail.artifacts.find(a => basename(a.name) === 'report.md');
  assert.ok(scoresArtifact, 'scores.json missing'); assert.ok(reportArtifact, 'report.md missing');
  const downloaded = await cli(['artifact', 'download', scoresArtifact.id, '--output', join(directory, 'scores-downloaded.json')]);
  const scores = JSON.parse(await readFile(downloaded.path, 'utf8'));
  assert.deepEqual(scores.map(row => [row.id, row.score]), [['synthetic-1', 1], ['synthetic-2', 0]]);
  const resourceList = await cli(['resource', 'list', '--kind', 'scoring_batch']);
  assert.ok(resourceList.resources.some(v => v.source.type === 'generated' && v.metadata.runId === currentRun), 'Generated scores were not registered');
  const summary = { checkedAt: new Date().toISOString(), synthetic: true, runtime: 'real-codex', version: (await cli(['health'])).version, submittedThrough: 'MCP official SDK over stdio', importedAndDownloadedThrough: 'CLI', runStatus: waited.run.status, scores: scores.map(row => ({ id: row.id, score: row.score })), artifacts: detail.artifacts.map(a => ({ name: a.name, hash: a.hash })), scoresDownloadSHA256: downloaded.sha256, frozenSourceHashes: detail.contracts[0].refs.map(ref => ref.hash), personalDataIncluded: false };
  if (values.output) await writeFile(resolve(values.output), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (currentRun && url) await cli(['run', 'cancel', currentRun]).catch(() => {});
  await mcp?.close();
  if (service && service.exitCode === null) { service.kill('SIGTERM'); await new Promise(resolve => service.once('exit', resolve)); }
  await rm(directory, { recursive: true, force: true });
}

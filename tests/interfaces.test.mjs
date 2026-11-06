import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createApp } from '../server/index.ts';
import { RPC } from '../server/runtime.ts';
import { OpenEvalClient, localURL, digest } from '../client/api.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const executable = resolve('bin/openeval.mjs');
async function cli(args, { input, url } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable, ...args, ...(url ? ['--url', url] : [])], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr, data: stdout.trim().startsWith('{') ? JSON.parse(stdout) : undefined }));
    child.stdin.end(input);
  });
}
async function eventually(check) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { const value = await check(); if (value) return value; await new Promise(r => setTimeout(r, 20)); }
  throw new Error('Condition did not complete in 10 seconds');
}
async function mcp(url, allowWrite = false) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [executable, 'mcp', '--url', url, ...(allowWrite ? ['--allow-write'] : [])], stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', chunk => stderr += chunk);
  const client = new Client({ name: 'openeval-interface-acceptance', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport, errors: () => stderr };
}

test('CLI and MCP share the real HTTP server and persistence; inference uses an explicit protocol fixture', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'openeval-interfaces-'));
  const app = createApp(join(directory, 'data'));
  // Only the model process is a fixture; actual Store, runtime orchestration, API,
  // CLI subprocess, MCP stdio process, SDK client, and file downloads are exercised.
  app.runtime.rpcFactory = cwd => new RPC(cwd, process.execPath, [resolve('tests/fixtures/rpc-fixture.mjs')]);
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const api = new OpenEvalClient({ url });
  const run = args => cli(args, { url });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });

  await t.test('imports Unicode original bytes, reads versioned records, refuses overwrite and malformed flags', async () => {
    const source = join(directory, 'records.json'); const original = JSON.stringify([{ id: '案例一', score: 3, unit: '原始三分制' }]); await writeFile(source, original);
    const imported = await run(['resource', 'import', '--file', source, '--kind', 'scoring_batch', '--title', 'Synthetic original scores']);
    assert.equal(imported.code, 0, imported.stderr); const version = imported.data;
    assert.equal(version.hash, digest(Buffer.from(original)));
    const records = await run(['version', 'records', version.id]); assert.equal(records.data.records[0].raw.score, 3);
    const output = join(directory, 'download.json'); const downloaded = await run(['version', 'download', version.id, '--output', output]);
    assert.equal(downloaded.code, 0, downloaded.stderr); assert.equal(await readFile(output, 'utf8'), original); assert.equal(downloaded.data.sha256, version.hash);
    const duplicate = await run(['version', 'download', version.id, '--output', output]); assert.equal(duplicate.code, 1); assert.match(duplicate.stderr, /EEXIST/);
    assert.equal((await run(['resource', 'list', '--typo', 'x'])).code, 2);
    assert.equal((await run(['version', 'get', '../health'])).code, 2);
    assert.equal((await run(['task', 'list', '--project', 'missing'])).code, 1);
    assert.equal((await run(['resource', 'list', '--query', '..'])).code, 0);
  });

  await t.test('CLI sharing exports only selected bytes, inspects without writes, imports independent copies and refuses overwrite',async()=>{
    const source=app.store.list('versions').find(v=>v.kind==='scoring_batch');const destination=join(directory,'scores.openeval.json');const before=app.store.list('versions').length;
    const exported=await run(['share','export','--version',source.id,'--output',destination]);assert.equal(exported.code,0,exported.stderr);assert.equal(exported.data.uploaded,false);
    assert.equal((await run(['share','export','--version',source.id,'--output',destination])).code,1);
    const inspected=await run(['share','inspect','--file',destination]);assert.equal(inspected.code,0,inspected.stderr);assert.equal(inspected.data.entries.length,1);assert.equal(app.store.list('versions').length,before);
    const imported=await run(['share','import','--file',destination]);assert.equal(imported.code,0,imported.stderr);assert.equal(imported.data.executionPerformed,false);assert.equal(app.store.list('versions').length,before+1);
    const copy=app.store.get('versions',imported.data.versionIds[0]);assert.equal(copy.hash,source.hash);assert.equal(app.store.records(copy.id)[0].raw.score,3);assert.notEqual(copy.id,source.id);
    assert.equal((await run(['share','export','--output',join(directory,'empty.json')])).code,1);
  });

  await t.test('stable request IDs prevent duplicate tasks/runs; waiting, cancellation and artifacts are truthful', async () => {
    const created = await run(['task', 'create', '--intent', 'standard', '--request-id', 'synthetic-task']);
    assert.equal(created.code, 0, created.stderr); const taskId = created.data.id;
    assert.equal((await run(['task', 'create', '--intent', 'standard', '--request-id', 'synthetic-task'])).data.id, taskId);
    const first = await run(['task', 'submit', taskId, '--text', 'create synthetic standard', '--request-id', 'synthetic-submit']);
    assert.equal(first.code, 0, first.stderr);
    const duplicate = await run(['task', 'submit', taskId, '--text', 'create synthetic standard', '--request-id', 'synthetic-submit']);
    assert.equal(duplicate.data.run.id, first.data.run.id);
    const waited = await run(['task', 'wait', taskId, '--run-id', first.data.run.id]); assert.equal(waited.code, 0, waited.stderr); assert.equal(waited.data.run.status, 'completed');
    assert.equal(app.store.list('runs', taskId).length, 1); assert.equal(waited.data.artifacts.length, 1);
    const artifact = await run(['artifact', 'read', waited.data.artifacts[0].id]); assert.equal(artifact.data.content, 'Protocol fixture partial artifact');
    const missing = await run(['task', 'create', '--intent', 'evaluate']);
    await run(['task', 'submit', missing.data.id, '--text', 'Evaluate without inventing prerequisites']);
    const blocked = await run(['task', 'wait', missing.data.id]); assert.equal(blocked.code, 4); assert.equal(blocked.data.run.status, 'waiting');
    const hold = await run(['task', 'submit', taskId, '--text', 'HOLD synthetic cancellation', '--request-id', 'hold']);
    const timeout = await run(['task', 'wait', taskId, '--run-id', hold.data.run.id, '--wait-ms', '0']); assert.equal(timeout.code, 124); assert.equal(timeout.data.timedOut, true);
    assert.equal(app.store.get('runs', hold.data.run.id).status, 'running');
    assert.equal((await run(['run', 'cancel', hold.data.run.id])).data.status, 'cancelled');
    assert.equal((await run(['task', 'wait', taskId, '--run-id', hold.data.run.id])).code, 3);
    const approval = await run(['task', 'submit', taskId, '--text', 'APPROVAL synthetic', '--request-id', 'approval']);
    const pending = await eventually(async () => (await api.request(`/api/tasks/${taskId}`)).pendingRequests[0]);
    assert.equal((await run(['request', 'respond', pending.id, '--decision', 'acceptForSession'])).code, 2);
    assert.equal((await run(['request', 'respond', pending.id, '--decision', 'decline'])).code, 0);
    await run(['task', 'wait', taskId, '--run-id', approval.data.run.id]);
  });

  await t.test('official SDK stdio handshake, tool schemas, resources, read-only enforcement and actionable errors', async () => {
    const { client, errors } = await mcp(url);
    try {
      const { tools } = await client.listTools(); assert.equal(tools.length, 10); assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
      assert.ok(!tools.some(tool => /submit|create|cancel|respond/.test(tool.name)));
      const health = await client.callTool({ name: 'openeval_health', arguments: {} }); assert.equal(health.structuredContent.ok, true);
      const projects = await client.callTool({ name: 'openeval_projects_list', arguments: {} }); assert.equal(projects.isError, undefined); assert.equal(projects.structuredContent.projects[0].id, 'default');
      const denied = await client.callTool({ name: 'openeval_task_create', arguments: { requestId: 'forbidden' } }); assert.equal(denied.isError, true);
      const before = app.store.list('tasks').length;
      const invalid = await client.callTool({ name: 'openeval_tasks_list', arguments: { projectId: 'missing' } }); assert.equal(invalid.isError, true); assert.match(invalid.content[0].text, /NOT_FOUND/);
      const extra = await client.callTool({ name: 'openeval_health', arguments: { shell: 'arbitrary' } }); assert.equal(extra.isError, true);
      assert.equal(app.store.list('tasks').length, before);
      const templates = await client.listResourceTemplates(); assert.equal(templates.resourceTemplates.length, 2);
      const version = app.store.list('versions').find(v => v.kind === 'scoring_batch');
      const resource = await client.readResource({ uri: `openeval://versions/${version.id}` }); assert.equal(JSON.parse(resource.contents[0].text).hash, version.hash);
      const artifact = app.store.list('artifacts')[0];
      const bytes = await client.readResource({ uri: `openeval://artifacts/${artifact.id}` }); assert.equal(bytes.contents[0].text, 'Protocol fixture partial artifact');
      assert.equal(errors(), '');
    } finally { await client.close(); }
  });

  await t.test('opt-in MCP writes persist and execute through the existing runtime without granting approvals', async () => {
    const { client } = await mcp(url, true);
    try {
      const tools = (await client.listTools()).tools; assert.equal(tools.length, 15); assert.ok(!tools.some(tool => /respond|approve|shell/.test(tool.name)));
      const call = async (name, args) => { const result = await client.callTool({ name: `openeval_${name}`, arguments: args }); assert.ok(!result.isError, JSON.stringify(result)); return result.structuredContent; };
      const task = await call('task_create', { title: 'Synthetic MCP task', intent: 'standard', requestId: 'mcp-create' });
      const submitted = await call('task_submit', { taskId: task.id, text: 'create synthetic standard from MCP', requestId: 'mcp-submit' });
      const duplicate = await call('task_submit', { taskId: task.id, text: 'create synthetic standard from MCP', requestId: 'mcp-submit' }); assert.equal(duplicate.run.id, submitted.run.id);
      const detail = await eventually(async () => { const detail = await call('task_get', { taskId: task.id }); return detail.runs[0].status === 'completed' && detail; });
      assert.equal(detail.artifacts.length, 1); assert.equal(detail.contracts[0].goalMode, null);
      const resource = await call('resource_create', { kind: 'reference', title: 'MCP synthetic input', text: 'No private data', fileName: 'synthetic.txt', mime: 'text/plain' });
      assert.equal((await api.request(`/api/versions/${resource.id}`)).text, 'No private data');
    } finally { await client.close(); }
  });
});

test('loopback boundary, redirect rejection and bounded responses', async t => {
  for (const url of ['https://example.com', 'http://192.168.1.1', 'http://127.0.0.1/path', 'http://user:pass@localhost', 'http://localhost?token=x', 'http://localhost/#x']) assert.throws(() => localURL(url));
  assert.equal(localURL('http://localhost:4321'), 'http://127.0.0.1:4321');
  const server = createServer((req, res) => {
    if (req.url === '/api/redirect') { res.writeHead(302, { Location: 'http://example.com/' }); res.end(); }
    else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ payload: 'x'.repeat(1000) })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const client = new OpenEvalClient({ url: `http://127.0.0.1:${server.address().port}` });
  await assert.rejects(client.request('/api/redirect'), error => error.code === 'CONNECTION_FAILED');
  await assert.rejects(client.request('/api/large', { maxBytes: 10 }), error => error.code === 'RESPONSE_TOO_LARGE');
  await assert.rejects(client.write('/api/tasks', {}), error => error.code === 'WRONG_SERVICE');
});

test('MCP config is printable and does not modify client settings; operations is discoverable', async () => {
  const config = await cli(['mcp', 'config', '--client', 'generic']); assert.equal(config.code, 0); assert.equal(config.data.mcpServers.openeval.command, process.execPath); assert.ok(!config.data.mcpServers.openeval.args.includes('--allow-write'));
  const toml = await cli(['mcp', 'config', '--client', 'codex', '--allow-write']); assert.match(toml.stdout, /\[mcp_servers.openeval\]/); assert.match(toml.stdout, /--allow-write/);
  const list = await cli(['operations']); assert.equal(list.code, 0, list.stderr); assert.equal(list.data.operations.length, 15);
});

test('unavailable service remains an actionable error and preserves the submission key', async () => {
  const submitted = await cli(['task', 'submit', 'synthetic-task', '--text', 'Synthetic unavailable-service check', '--request-id', 'recover-this-key'], { url: 'http://127.0.0.1:1' });
  assert.equal(submitted.code, 1); const error = JSON.parse(submitted.stderr).error;
  assert.equal(error.code, 'CONNECTION_FAILED'); assert.equal(error.details.requestId, 'recover-this-key');
  const doctor=await cli(['doctor'],{url:'http://127.0.0.1:1'});assert.equal(doctor.code,1);assert.equal(doctor.data.ok,false);assert.equal(doctor.data.checks.service.code,'CONNECTION_FAILED');assert.equal(doctor.data.inferencePerformed,false);
  const { client } = await mcp('http://127.0.0.1:1');
  try { const result = await client.callTool({ name: 'openeval_health', arguments: {} }); assert.equal(result.isError, true); assert.match(result.content[0].text, /CONNECTION_FAILED/); }
  finally { await client.close(); }
});


test('agent-selected goal mode defaults to automatic origin; explicit user selection remains available',async()=>{
 const {invoke}=await import('../client/operations.mjs');const observed=[];const stub={write:async(path,input)=>{observed.push(input);return input;}};
 const base={taskId:'synthetic',text:'Synthetic goal',requestId:'origin-test',goalMode:{objective:'Finish the synthetic task'}};
 await invoke(stub,'task_submit',base);assert.equal(observed[0].goalMode.origin,'automatic');
 await invoke(stub,'task_submit',{...base,goalMode:{...base.goalMode,origin:'user'}});assert.equal(observed[1].goalMode.origin,'user');
});

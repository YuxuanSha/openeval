#!/usr/bin/env node
import { readFile, open } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { OpenEvalClient, InterfaceError, errorEnvelope, digest } from '../client/api.mjs';

const help = `OpenEval — local evaluation CLI and stdio MCP (Node.js 24+)

  openeval serve [--port 4318] [--data-dir .openeval]
  openeval health | runtime | doctor
  openeval project list | create --name NAME
  openeval task list [--project ID]
  openeval task create [--title TITLE] [--intent chat] [--project ID] [--request-id KEY]
  openeval task get ID
  openeval task submit ID --text TEXT [--ref VERSION[:SHA256]] [--request-id KEY]
  openeval task wait ID [--run-id ID] [--wait-ms 60000]
  openeval run cancel ID
  openeval share export --version ID [--artifact ID] --output FILE [--project ID]
  openeval share inspect --file FILE
  openeval share import --file FILE [--project ID]
  openeval resource list [--kind KIND] [--query TEXT] [--project ID]
  openeval resource import --kind KIND --title TITLE --file PATH [--project ID]
  openeval resource versions ID
  openeval version get ID | records ID [--offset 0] [--limit 100]
  openeval version download ID --output PATH
  openeval artifact read ID | download ID --output PATH
  openeval request respond ID --decision accept|decline|cancel
  openeval request respond ID --input answers.json
  openeval call OPERATION --input arguments.json  (or --input - for stdin)
  openeval mcp [--allow-write]
  openeval mcp config [--client generic|claude|cursor|codex] [--allow-write]
  openeval operations

API commands accept --url http://127.0.0.1:4318, --timeout-ms 15000 and --json.
Put options after the command. OPENEVAL_URL supplies the default connection.
Commands print JSON; failures print JSON to stderr. Downloads never overwrite.
Submitting may use model quota; --request-id safely recovers the same submission.
MCP defaults to read-only; configuration prints a snippet without installing it.
Use 'openeval operations' for input schemas and docs/cli-mcp.md for full guidance.
`;
const output = value => console.log(JSON.stringify(value, null, 2));
const string = { type: 'string' }; const boolean = { type: 'boolean' };
const common = { url: string, 'timeout-ms': string, json: boolean, help: boolean };
function options(args, extra = {}, count = 0) {
  const result = parseArgs({ args, options: { ...common, ...extra }, allowPositionals: true, strict: true });
  if (result.values.help) { console.log(help); return null; }
  if (result.positionals.length !== count) throw new InterfaceError('USAGE', `Expected ${count} positional argument(s). Run openeval --help.`);
  return result;
}
function required(value, name) { if (typeof value !== 'string' || !value.trim()) throw new InterfaceError('USAGE', `${name} is required.`); return value; }
async function readBytes(file, maxBytes) {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes) throw new InterfaceError('FILE_SIZE', `Expected a regular file up to ${maxBytes} bytes.`);
    // Read no more than the limit even if another process grows the file.
    const buffer = Buffer.alloc(Math.min(info.size + 1, maxBytes + 1));
    let offset = 0;
    while (offset < buffer.length) { const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset); if (!bytesRead) break; offset += bytesRead; }
    if (offset > maxBytes || offset > info.size) throw new InterfaceError('FILE_CHANGED', 'The input file changed while reading. Retry after the writer finishes.');
    return buffer.subarray(0, offset);
  } finally { await handle.close(); }
}
async function readJSON(file) {
  required(file, '--input');
  let bytes;
  if (file === '-') { const parts = []; let size = 0; for await (const part of process.stdin) { size += part.length; if (size > 56 * 1024 * 1024) throw new InterfaceError('FILE_SIZE', 'JSON input exceeds 56 MiB.'); parts.push(part); } bytes = Buffer.concat(parts); }
  else bytes = await readBytes(file, 56 * 1024 * 1024);
  try { return JSON.parse(bytes.toString()); } catch { throw new InterfaceError('INVALID_JSON', 'Input must contain one JSON object.'); }
}
async function main(args) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new InterfaceError('NODE_VERSION', 'OpenEval requires Node.js 24 or newer.');
  if (!args.length || ['--help', '-h', 'help'].includes(args[0])) { console.log(help); return; }
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  if (args[0] === '--version') { console.log(pkg.version); return; }
  const group = args.shift();
  if (group === 'serve') {
    const parsed = options(args, { port: string, 'data-dir': string }); if (!parsed) return;
    const { serve } = await import('../client/serve.mjs');
    await serve({ port: parsed.values.port, dataDir: parsed.values['data-dir'] }); return;
  }
  if (group === 'mcp') {
    const config = args[0] === 'config'; if (config) args.shift();
    const parsed = options(args, { 'allow-write': boolean, client: string }); if (!parsed) return;
    const client = new OpenEvalClient({ url: parsed.values.url, timeout: Number(parsed.values['timeout-ms'] ?? 15000) });
    const allowWrite = !!parsed.values['allow-write'];
    if (config) {
      const target = parsed.values.client ?? 'generic';
      const entry = { command: process.execPath, args: [resolve(import.meta.dirname, 'openeval.mjs'), 'mcp', '--url', client.url, ...(allowWrite ? ['--allow-write'] : [])] };
      if (target === 'codex') console.log(`[mcp_servers.openeval]\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(entry.args)}\n`);
      else if (['generic', 'claude', 'cursor'].includes(target)) output({ mcpServers: { openeval: entry } });
      else throw new InterfaceError('USAGE', '--client must be generic, claude, cursor, or codex.');
    } else {
      if (parsed.values.client) throw new InterfaceError('USAGE', '--client is only valid for mcp config.');
      const { serveMcp } = await import('../client/mcp.mjs'); await serveMcp(client, { allowWrite, version: pkg.version });
    }
    return;
  }
  if (group === 'share') {
    const action = args.shift();
    if (!['export', 'inspect', 'import'].includes(action)) throw new InterfaceError('USAGE', 'Use share export, inspect or import.');
    const parsed = options(args, action === 'export' ? { version: { type: 'string', multiple: true }, artifact: { type: 'string', multiple: true }, output: string, project: string } : { file: string, ...(action === 'import' ? { project: string } : {}) });
    if (!parsed) return;
    const v = parsed.values, client = new OpenEvalClient({ url: v.url, timeout: Number(v['timeout-ms'] ?? 15000) });
    if (action === 'export') {
      const destination = resolve(required(v.output, '--output'));
      const pkg = await client.write('/api/shares/export', { projectId: v.project ?? 'default', versionIds: v.version ?? [], artifactIds: v.artifact ?? [] });
      const bytes = Buffer.from(JSON.stringify(pkg)); const handle = await open(destination, 'wx', 0o600);
      try { await handle.writeFile(bytes); } finally { await handle.close(); }
      output({ path: destination, entries: pkg.entries.length, byteSize: bytes.length, sha256: digest(bytes), manifestSha256: pkg.manifestSha256, uploaded: false });
    } else {
      const pkg = await readJSON(required(v.file, '--file'));
      output(await client.write(`/api/shares/${action}`, { package: pkg, ...(action === 'import' ? { projectId: v.project ?? 'default' } : {}) }));
    }
    return;
  }
  if (group === 'doctor') {
    const parsed = options(args); if (!parsed) return;
    const client = new OpenEvalClient({ url: parsed.values.url, timeout: Number(parsed.values['timeout-ms'] ?? 15000) });
    const checks = { node: { ok: true, version: process.version }, service: null, codex: null };
    try { const h = await client.health(); checks.service = { ok: true, version: h.version, url: client.url }; }
    catch (error) { checks.service = { ok: false, ...errorEnvelope(error).error }; }
    if (checks.service.ok) {
      try { const r = await client.request('/api/runtime'); checks.codex = { ok: !!(r.available && r.authenticated), available: r.available, authenticated: r.authenticated, version: r.version, modelCount: r.models?.length ?? 0, ...(r.error ? { error: r.error } : {}) }; }
      catch (error) { checks.codex = { ok: false, ...errorEnvelope(error).error }; }
    }
    const ok = !!(checks.service.ok && checks.codex?.ok); output({ ok, checks, inferencePerformed: false, notes: ['Skill ZIP import additionally requires /usr/bin/python3 on the service host.', 'Start the desktop app or openeval serve before connecting. Login remains in Codex CLI.'] });
    if (!ok) process.exitCode = 1; return;
  }
  const { operations, invoke } = await import('../client/operations.mjs');
  if (group === 'operations') {
    if (!options(args)) return;
    const { zodToJsonSchema } = await import('zod-to-json-schema');
    output({ operations: operations.map(op => ({ name: op.name, write: op.write, description: op.description, inputSchema: zodToJsonSchema(op.schema) })) }); return;
  }
  let name, input = {}, parsed;
  const action = ['health', 'runtime', 'call'].includes(group) ? null : args.shift();
  if (group === 'call') { parsed = options(args, { input: string }, 1); if (!parsed) return; name = parsed.positionals[0]; input = await readJSON(parsed.values.input); }
  else if (['health', 'runtime'].includes(group)) { name = group; parsed = options(args); }
  else {
    const spec = {
      'project list': ['projects_list', {}, 0], 'project create': ['project_create', { name: string }, 0],
      'task list': ['tasks_list', { project: string }, 0],
      'task create': ['task_create', { project: string, title: string, intent: string, 'request-id': string }, 0],
      'task get': ['task_get', {}, 1], 'task submit': ['task_submit', { text: string, 'text-file': string, intent: string, model: string, effort: string, 'request-id': string, ref: { type: 'string', multiple: true }, 'goal-objective': string }, 1],
      'task wait': ['wait', { 'run-id': string, 'wait-ms': string }, 1], 'run cancel': ['run_cancel', {}, 1],
      'resource list': ['resources_list', { project: string, kind: string, query: string }, 0],
      'resource import': ['resource_create', { project: string, kind: string, title: string, file: string, mime: string, 'version-label': string }, 0],
      'resource versions': ['resource_versions', {}, 1], 'version get': ['version_get', {}, 1],
      'version records': ['version_records', { offset: string, limit: string }, 1],
      'artifact read': ['artifact_read', {}, 1], 'artifact download': ['download', { output: string }, 1], 'version download': ['download', { output: string }, 1],
      'request respond': ['respond', { decision: string, input: string }, 1],
    }[`${group} ${action}`];
    if (!spec) throw new InterfaceError('USAGE', 'Unknown command. Run openeval --help.');
    [name] = spec; parsed = options(args, spec[1], spec[2]);
  }
  if (!parsed) return;
  const v = parsed.values, entityId = parsed.positionals[0];
  const client = new OpenEvalClient({ url: v.url, timeout: Number(v['timeout-ms'] ?? 15000) });
  if (group !== 'call') {
    for (const [flag, key] of Object.entries({ project: 'projectId', title: 'title', intent: 'intent', kind: 'kind', query: 'q', name: 'name', model: 'model', effort: 'effort', mime: 'mime', 'version-label': 'versionLabel' })) if (v[flag] !== undefined) input[key] = v[flag];
    if (['task_get', 'task_submit'].includes(name)) input.taskId = entityId;
    if (name === 'run_cancel') input.runId = entityId;
    if (name === 'resource_versions') input.resourceId = entityId;
    if (['version_get', 'version_records'].includes(name)) input.versionId = entityId;
    if (name === 'artifact_read') input.artifactId = entityId;
    if (name === 'version_records') for (const key of ['offset', 'limit']) if (v[key] !== undefined) input[key] = Number(v[key]);
    if (name === 'task_create' || name === 'task_submit') input.requestId = v['request-id'] ?? randomUUID();
    if (name === 'task_submit') {
      if ((v.text !== undefined) === (v['text-file'] !== undefined)) throw new InterfaceError('USAGE', 'Supply exactly one of --text or --text-file.');
      input.text = v.text ?? (await readBytes(v['text-file'], 400000)).toString();
      input.refs = (v.ref ?? []).map(value => { const parts = value.split(':'); if (parts.length > 2) throw new InterfaceError('USAGE', '--ref is VERSION or VERSION:SHA256.'); return { versionId: parts[0], ...(parts[1] ? { hash: parts[1] } : {}) }; });
      if (v['goal-objective']) input.goalMode = { objective: v['goal-objective'], origin: 'user' };
    }
    if (name === 'resource_create') {
      const file = required(v.file, '--file'); const bytes = await readBytes(file, 40 * 1024 * 1024);
      input.contentBase64 = bytes.toString('base64'); input.fileName = basename(file);
      input.mime ??= ({ '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.json': 'application/json', '.jsonl': 'application/json', '.html': 'text/html', '.zip': 'application/zip' })[extname(file).toLowerCase()] ?? 'application/octet-stream';
    }
  }
  if (name === 'download') {
    const destination = resolve(required(v.output, '--output'));
    const { bytes, mime } = await client.download(group === 'version' ? 'versions' : 'artifacts', entityId);
    const handle = await open(destination, 'wx', 0o600);
    try { await handle.writeFile(bytes); } finally { await handle.close(); }
    output({ path: destination, byteSize: bytes.length, sha256: digest(bytes), mime }); return;
  }
  if (name === 'respond') {
    if ((v.decision !== undefined) === (v.input !== undefined)) throw new InterfaceError('USAGE', 'Supply one of --decision or --input.');
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(entityId)) throw new InterfaceError('INVALID_ID', 'Invalid request ID.');
    const response = v.input ? await readJSON(v.input) : { decision: v.decision };
    if (!response || typeof response !== 'object' || Array.isArray(response) || Object.keys(response).some(key => !['decision', 'answers'].includes(key)) ||
        (response.decision !== undefined) === (response.answers !== undefined) ||
        (response.decision !== undefined && !['accept', 'decline', 'cancel'].includes(response.decision)) ||
        (response.answers !== undefined && (!response.answers || typeof response.answers !== 'object' || Array.isArray(response.answers)))) throw new InterfaceError('INVALID_ARGUMENTS', 'Use one explicit decision (accept, decline, cancel) or an answers object. Session-wide acceptance is not exposed.');
    output(await client.write(`/api/requests/${entityId}/respond`, response)); return;
  }
  if (name === 'wait') {
    const duration = Number(v['wait-ms'] ?? 60000);
    if (!Number.isSafeInteger(duration) || duration < 0 || duration > 86400000) throw new InterfaceError('USAGE', '--wait-ms must be 0–86400000.');
    const end = Date.now() + duration; let runId = v['run-id'];
    while (true) {
      const detail = await invoke(client, 'task_get', { taskId: entityId });
      const run = runId ? detail.runs.find(run => run.id === runId) : detail.runs.at(-1);
      if (!run) throw new InterfaceError('NOT_FOUND', 'No matching run in this task.');
      runId = run.id;
      const result = { run, artifacts: detail.artifacts.filter(a => a.runId === run.id), pendingRequests: detail.pendingRequests.filter(r => r.runId === run.id) };
      if (!['queued', 'running'].includes(run.status)) { output(result); process.exitCode = run.status === 'completed' ? 0 : run.status === 'waiting' ? 4 : 3; return; }
      if (Date.now() >= end) { output({ ...result, timedOut: true, message: 'Stopped waiting. The run continues; use run cancel to stop it.' }); process.exitCode = 124; return; }
      await new Promise(resolve => setTimeout(resolve, Math.min(500, Math.max(1, end - Date.now()))));
    }
  }
  try {
    const result = await invoke(client, name, input);
    output(input.requestId ? { ...result, requestId: input.requestId } : result);
  } catch (error) { if (input.requestId) error.details = { ...(error.details ?? {}), requestId: input.requestId }; throw error; }
}

main(process.argv.slice(2)).catch(error => { console.error(JSON.stringify(errorEnvelope(error))); process.exitCode = ['USAGE', 'INVALID_ARGUMENTS', 'INVALID_JSON', 'INVALID_ID'].includes(error.code) || error.code?.startsWith('ERR_PARSE_ARGS') ? 2 : 1; });

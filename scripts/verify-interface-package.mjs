// Packs and installs the actual npm archive in a new directory, without inference.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const temporary = await mkdtemp(join(tmpdir(), 'openeval-package-'));
const cache = process.env.OPENEVAL_TEST_NPM_CACHE ?? join(temporary, 'npm-cache');
const env = { ...process.env, PATH: dirname(process.execPath) + ':' + process.env.PATH };
let service, mcp;
async function command(bin, args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', part => stdout += part); child.stderr.on('data', part => stderr += part);
    child.once('error', reject); child.once('close', code => code ? reject(Error(`${bin} failed (${code}): ${stderr}\n${stdout}`)) : resolve(stdout));
  });
}
try {
  const packed = JSON.parse(await command('npm', ['pack', '--json', '--cache', cache, '--pack-destination', temporary]))[0];
  const paths = packed.files.map(file => file.path);
  for (const required of ['bin/openeval.mjs', 'client/mcp.mjs', 'dist/server/index.js', 'npm-shrinkwrap.json', 'docs/file-sharing.md', 'dist/server/sharing.js', 'dist/server/package-root.js', 'assets/builtin-skills/openeval-agile-evaluator/SKILL.md']) assert.ok(paths.includes(required), `Missing ${required}`);
  for (const path of paths) assert.ok(!/(^|\/)(?:\.openeval[^/]*|\.codex|\.env[^/]*|evidence|private-inputs|openeval-workflow-assets|node_modules|workspaces|sessions)(\/|$)|\.(?:sqlite|db)(?:-|$)/.test(path), `Private runtime path packaged: ${path}`);
  const archive = join(temporary, packed.filename), install = join(temporary, 'installed');
  await command('npm', ['install', '--prefix', install, '--ignore-scripts', '--no-audit', '--no-fund', '--cache', cache, ...(process.env.OPENEVAL_TEST_OFFLINE === '1' ? ['--offline'] : []), archive]);
  const bin = join(install, 'node_modules/openeval/bin/openeval.mjs');
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal((await command(process.execPath, [bin, '--version'], temporary)).trim(), pkg.version);
  service = spawn(process.execPath, [bin, 'serve', '--port', '0', '--data-dir', join(temporary, 'data')], { env, cwd: temporary, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = ''; service.stderr.on('data', part => errors += part);
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Package startup timeout: ${errors}`)), 15000);
    const lines = createInterface({ input: service.stdout });
    lines.on('line', line => { try { const value = JSON.parse(line); if (value.status === 'ready') { clearTimeout(timer); resolve(value); } } catch {} });
    service.once('error', error => { clearTimeout(timer); reject(error); }); service.once('exit', code => { clearTimeout(timer); reject(Error(`Installed service exited ${code}: ${errors}`)); });
  });
  const cli = async args => JSON.parse(await command(process.execPath, [bin, ...args, '--url', ready.url], temporary));
  const health = await cli(['health']); assert.equal(health.version, pkg.version);
  const skills = await cli(['resource', 'list', '--kind', 'skill']); assert.equal(skills.resources.length, 5);
  assert.equal((await (await fetch(ready.url + '/api/example-packs')).json()).packs.length, 0);
  const input = join(temporary, 'synthetic.json');await writeFile(input, JSON.stringify([{caseId:'portable-1',score:3}]));
  const source = await cli(['resource','import','--kind','scoring_batch','--title','Synthetic package scores','--file',input]);
  const portable = join(temporary,'synthetic.openeval.json');await cli(['share','export','--version',source.id,'--output',portable]);
  const inspected = await cli(['share','inspect','--file',portable]);assert.equal(inspected.entries.length,1);assert.equal(inspected.credentialRisk,false);
  const imported = await cli(['share','import','--file',portable]);assert.equal(imported.imported,1);assert.equal(imported.executionPerformed,false);
  const copy = await cli(['version','get',imported.versionIds[0]]);assert.equal(copy.hash,source.hash);assert.notEqual(copy.id,source.id);
  assert.equal((await cli(['version','records',copy.id])).records[0].raw.score,3);
  const task = await cli(['task', 'create', '--intent', 'evaluate', '--request-id', 'package-task']);
  const submitted = await cli(['task', 'submit', task.id, '--text', 'Package smoke: do not invent missing prerequisites', '--request-id', 'package-submit']); assert.equal(submitted.run.status, 'waiting');
  mcp = new Client({ name: 'openeval-package-check', version: '1.0.0' });
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [bin, 'mcp', '--url', ready.url], cwd: temporary, stderr: 'pipe' }));
  assert.equal((await mcp.listTools()).tools.length, 10);
  const detail = await mcp.callTool({ name: 'openeval_task_get', arguments: { taskId: task.id } }); assert.ok(!detail.isError); assert.equal(detail.structuredContent.runs[0].status, 'waiting');
  const summary = { checkedAt: new Date().toISOString(), package: packed.filename, integrity: packed.integrity, fileCount: paths.length, version: pkg.version, compiledBackendInstalled: true, portableSharingRoundTrip: true, builtinSkills: skills.resources.length, mcpReadTools: 10, syntheticWaitingRun: true, privateRuntimePathsIncluded: false, inferencePerformed: false };
  if (process.env.OPENEVAL_PACKAGE_EVIDENCE) await writeFile(process.env.OPENEVAL_PACKAGE_EVIDENCE, JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await mcp?.close();
  if (service && service.exitCode === null) { service.kill('SIGTERM'); await new Promise(resolve => service.once('exit', resolve)); }
  await rm(temporary, { recursive: true, force: true });
}

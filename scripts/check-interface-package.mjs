// Validate the npm distribution allowlist, including optional compiled web assets.
// Mirrors the existing local-package private-marker check; not a general DLP claim.
import { lstatSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { auditFiles } from './release-audit.mjs';
const paths = [];
const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (!existsSync(join(root, 'dist/server/index.js'))) throw Error('Compile the backend before packaging.');
const inputs = new Set([...pkg.files, 'package.json', 'README.md', 'README.zh-CN.md']);
let count = 0;
function walk(file) {
  const info = lstatSync(file);
  if (info.isSymbolicLink()) throw Error(`Distribution symlink is not allowed: ${relative(root, file)}`);
  if (info.isDirectory()) { for (const name of readdirSync(file)) walk(join(file, name)); return; }
  count++;paths.push(relative(root,file));
  if (!/\.(?:mjs|js|json|html|md|txt|css|svg)$/.test(file)) return;
  const text = readFileSync(file, 'utf8');
  if (/\/Users\/|libfile_[a-z0-9]+|https?:\/\/[^\s]+\.(?:feishu\.cn|larkoffice\.com)\/|-----BEGIN [A-Z ]*PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{20}/.test(text)) {
    throw Error(`Private fixture marker in distribution input: ${relative(root, file)}. No npm archive created.`);
  }
}
for (const input of inputs) {
  const file = resolve(root, input);
  if (!file.startsWith(root + '/') || /(?:^|\/)(?:\.openeval[^/]*|\.codex|\.env[^/]*|evidence|private-inputs|openeval-workflow-assets|node_modules|workspaces|sessions)(?:\/|$)/.test(input)) throw Error(`Unsafe distribution allowlist entry: ${input}`);
  if (existsSync(file)) walk(file);
  else if (input !== 'web/dist/') throw Error(`Missing distribution input: ${input}`);
}
const audit=auditFiles(root,paths);if(!audit.ok)throw Error(`Release audit failed: ${JSON.stringify(audit.findings)}`);
console.error(`OpenEval package guard checked ${count} allowlisted files; optional web UI: ${existsSync(join(root, 'web/dist/index.html'))}.`);

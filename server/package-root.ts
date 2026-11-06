import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source checkout: server/. Installed npm archive: dist/server/.
// Persistent data is selected separately; never infer it from the package root.
const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGE_ROOT = existsSync(join(moduleRoot, 'package.json')) ? moduleRoot : resolve(moduleRoot, '..');
export const PACKAGE_VERSION: string = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;

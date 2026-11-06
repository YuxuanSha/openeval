import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { InterfaceError } from './api.mjs';

export async function serve({ port = process.env.OPENEVAL_PORT ?? '4318', dataDir = process.env.OPENEVAL_DATA_DIR ?? '.openeval' } = {}) {
  const parsedPort = Number(port);
  if (!Number.isSafeInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) throw new InterfaceError('INVALID_PORT', 'Port must be an integer from 0 to 65535 (0 selects a free local port).');
  const root = resolve(import.meta.dirname, '..');
  const entry = existsSync(join(root, 'dist/server/index.js')) ? join(root, 'dist/server/index.js') : join(root, 'server/index.ts');
  if (!existsSync(entry)) throw new InterfaceError('BUILD_MISSING', 'Backend build is missing. Run npm run build:server before packaging.');
  const { createApp } = await import(pathToFileURL(entry).href);
  const app = createApp(resolve(dataDir), { privateExamples: false });
  let closing;
  const close = () => closing ??= app.close();
  try {
    await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(parsedPort, '127.0.0.1', resolve); });
  } catch (error) { await close(); throw error; }
  const address = app.server.address();
  console.log(JSON.stringify({ status: 'ready', url: `http://127.0.0.1:${address.port}`, dataDir: app.store.root, instanceId: app.instance.id, webAvailable: existsSync(join(root, 'web/dist/index.html')) }));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    const timer = setTimeout(() => process.exit(1), 15000); timer.unref();
    void close().then(() => { clearTimeout(timer); process.exit(0); }, error => { console.error(error.message); process.exit(1); });
  });
  return app;
}

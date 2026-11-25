// Build with npm --prefix web run build, then run with Node 24 and an installed Chrome.
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createApp } from '../../server/index.ts';
import { RPC } from '../../server/runtime.ts';

await access(new URL('../dist/index.html', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'openeval-preferences-'));
const fixture = fileURLToPath(new URL('../../tests/fixtures/rpc-fixture.mjs', import.meta.url));
const primary = { id: 'fixture-model', label: 'Protocol fixture', efforts: ['low'], defaultEffort: 'low', isDefault: true };
const secondary = { id: 'fixture-b', label: 'Fixture B', efforts: ['medium', 'high'], defaultEffort: 'medium' };
let models = [primary, secondary];
// Runtime discovery is supplied by the test, and every executed turn goes to the protocol double.
process.env.OPENEVAL_CODEX_BIN = process.execPath;
const app = createApp(join(root, 'data'), { privateExamples: false });
app.runtime.rpcFactory = cwd => new RPC(cwd, process.execPath, [fixture]);
let browser, page, url;
const errors = [];
const button = name => page.getByRole('button', { name, exact: true });
const goalInput = () => page.getByRole('textbox', { name: '目标描述' });
const label = (control, value) => button(control).getByText(value, { exact: true }).waitFor();

async function reopen() {
  await browser?.close();
  browser = await chromium.launchPersistentContext(join(root, 'chrome-profile'), {
    ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: 'chrome' }),
    headless: true, viewport: { width: 1280, height: 900 }, serviceWorkers: 'block',
  });
  await browser.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.origin !== url) {
      errors.push('Unexpected destination: ' + target.origin);
      return route.abort();
    }
    if (target.pathname === '/api/runtime') return route.fulfill({
      json: { available: true, authenticated: true, models, goals: { supported: true, enabled: true } },
    });
    return route.continue();
  });
  page = browser.pages()[0] || await browser.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.getByRole('heading', { name: '新任务', exact: true }).waitFor();
}

async function newTask() {
  const before = page.url();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '新任务', exact: true }).click();
  await page.waitForURL(next => next.href !== before && next.pathname.startsWith('/tasks/'));
}

async function choose(control, option) {
  await button(control).click();
  await button(option).click();
}

async function send(text, expected) {
  await page.getByRole('textbox', { name: '任务输入' }).fill(text);
  const [response] = await Promise.all([
    page.waitForResponse(r => r.request().method() === 'POST' && /\/api\/tasks\/[^/]+\/messages$/.test(r.url())),
    button('发送任务').click(),
  ]);
  const { requestId, ...body } = response.request().postDataJSON();
  assert.ok(requestId);
  assert.deepEqual(body, { text, refs: [], ...expected });
  assert.equal(response.status(), 202);
  const { run } = await response.json();
  assert.equal(run.permissionMode, expected.permissionMode);
  assert.equal(run.model, expected.model);
  assert.equal(run.effort, expected.effort ?? null);
  if (expected.intent === 'evaluate') {
    // The real backend requests missing evaluation inputs before invoking Codex.
    await page.getByText('需要补充任务依据', { exact: true }).waitFor();
  } else {
    await page.locator('.message-assistant').getByText('fixture progress', { exact: true }).waitFor();
  }
}

try {
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  url = 'http://127.0.0.1:' + app.server.address().port;
  await reopen();
  await label('选择模型', primary.label);
  await label('选择执行权限', '请求批准');
  await label('选择思考力度', '默认思考');
  await button('选择执行权限').click();
  const modes = page.getByLabel('执行权限', { exact: true }).getByRole('button');
  assert.equal(await modes.count(), 3);
  for (const name of ['请求批准', '自动审批', '完全访问']) {
    const option = modes.filter({ hasText: name }).first();
    assert.equal(await option.getAttribute('aria-pressed'), String(name === '请求批准'));
  }
  await page.keyboard.press('Escape');
  await send('Synthetic request approval check', { intent: 'chat', model: primary.id, permissionMode: 'ask', goalMode: null });

  await newTask();
  await choose('选择思考力度', '低');
  await choose('选择模型', secondary.label);
  await label('选择思考力度', '默认思考');
  await choose('选择思考力度', '高');
  await choose('选择任务方式', '敏捷评测');
  await choose('添加资料与工具', '目标模式');
  await goalInput().fill('Synthetic objective for this task only');
  await button('选择执行权限').click();
  await page.getByRole('button', { name: /^自动审批/ }).click();
  await button('选择执行权限').click();
  await page.getByRole('button', { name: /^完全访问/ }).click();
  await button('确认完全访问').waitFor();
  await label('选择执行权限', '自动审批');
  await button('返回').click();
  await page.keyboard.press('Escape');

  await reopen();
  await newTask();
  await label('选择执行权限', '自动审批');
  await label('选择任务方式', '敏捷评测');
  await label('选择模型', secondary.label);
  await label('选择思考力度', '高思考');
  assert.equal(await goalInput().inputValue(), '');
  const text = 'Synthetic automatic approval check';
  await send(text, { intent: 'evaluate', model: secondary.id, effort: 'high', permissionMode: 'auto', goalMode: { objective: text, origin: 'user' } });

  await newTask();
  await button('关闭目标模式').click();
  await button('选择执行权限').click();
  await page.getByRole('button', { name: /^完全访问/ }).click();
  assert.match(await page.getByLabel('执行权限', { exact: true }).getByRole('status').innerText(), /工作区外.*网络/);
  await button('确认完全访问').click();
  await reopen();
  await newTask();
  await label('选择执行权限', '完全访问');
  await label('选择模型', secondary.label);
  await label('选择思考力度', '高思考');
  assert.equal(await goalInput().count(), 0);
  await choose('选择模型', primary.label);
  await label('选择思考力度', '低思考');
  await choose('选择模型', secondary.label);
  await label('选择思考力度', '高思考');
  const evaluation = { intent: 'evaluate', model: secondary.id, permissionMode: 'full', goalMode: null };
  await send('Synthetic full access check', { ...evaluation, effort: 'high' });

  models = [primary, { ...secondary, efforts: ['medium'] }];
  await reopen();
  await label('选择模型', secondary.label);
  await label('选择思考力度', '默认思考');
  await send('Synthetic retired effort check', evaluation);
  models = [primary];
  await reopen();
  await label('选择模型', primary.label);
  await label('选择思考力度', '低思考');
  await button('选择执行权限').click();
  await page.getByRole('button', { name: /^请求批准/ }).click();
  await send('Synthetic retired model check', { ...evaluation, model: primary.id, effort: 'low', permissionMode: 'ask' });
  assert.deepEqual(errors, []);
  console.log('PASS: three permissions, full-access confirmation and cancellation, browser relaunch, per-model effort and catalog changes, five JSON submissions.');
  for (const width of [390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(url);
    await label('选择模型', primary.label);
    await button('选择执行权限').click();
    const menu = page.getByLabel('执行权限', { exact: true });
    const box = await menu.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width,
      `Permission menu exceeds ${width}px viewport: ${JSON.stringify(box)}`);
    await page.getByRole('button', { name: /^完全访问/ }).click();
    await button('确认完全访问').waitFor();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: full permission menu fits 390px and 430px windows.');
} finally {
  await browser?.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
}

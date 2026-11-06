import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/index.ts';
import { addVersion, createTask } from '../../server/domain.ts';

const root=mkdtempSync(join(tmpdir(),'openeval-share-browser-'));const app=createApp(root);
const evidence=new URL('../../evidence/sharing/',import.meta.url);mkdirSync(evidence,{recursive:true});
const report=addVersion(app.store,{projectId:'default',kind:'report',title:'Synthetic report',versionLabel:'Example v1',text:'# Portable evidence\n\n![Example pixel](pixel.png)',mime:'text/markdown',fileName:'report.md'});
const task=createTask(app.store,{projectId:'default',title:'Synthetic sharing task'});
app.store.insert('artifacts',{id:'report-artifact',taskId:task.id,runId:'synthetic',name:'synthetic/report.md',hash:report.hash,mime:report.mime,byteSize:report.byteSize,createdAt:report.createdAt,url:'/api/artifacts/report-artifact/download'},task.id);
report.metadata.artifactId='report-artifact';app.store.put('versions',report,'default');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL9sAAAAASUVORK5CYII=','base64');
app.store.insert('artifacts',{id:'pixel-artifact',taskId:task.id,runId:'synthetic',name:'synthetic/pixel.png',hash:app.store.blob(png),mime:'image/png',byteSize:png.length,createdAt:report.createdAt,url:'/api/artifacts/pixel-artifact/download'},task.id);
await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});const base=`http://127.0.0.1:${app.server.address().port}`;
let browser;const checks=[];
try{
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/runtime*',route=>route.fulfill({json:{available:false,authenticated:false,models:[],error:'Synthetic UI check: no inference'}}));
 await page.goto(base);await page.getByRole('button',{name:'文件分享',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByText('Synthetic report',{exact:true}).waitFor();await dialog.locator('.share-selection > div').filter({hasText:'Synthetic report'}).getByRole('checkbox').check();await dialog.getByRole('checkbox',{name:/synthetic\/pixel.png/}).check();await dialog.getByRole('button',{name:'检查所选文件',exact:true}).click();await dialog.getByText(/已验证 2 个文件/).waitFor();assert.equal(await dialog.getByRole('button',{name:'下载分享包',exact:true}).isDisabled(),true);await dialog.getByRole('checkbox',{name:'我已检查所选文件，确认这些内容可以分享。'}).check();await page.screenshot({path:new URL('export.png',evidence).pathname});
 const [download]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:'下载分享包',exact:true}).click()]);const file=await download.path();const pkg=JSON.parse(readFileSync(file,'utf8'));assert.equal(pkg.entries.length,2);assert.equal(pkg.format,'openeval.share');checks.push('explicit two-file export and real browser download');
 await dialog.getByRole('button',{name:'导入分享包',exact:true}).click();await dialog.getByLabel('选择分享包').setInputFiles(file);await dialog.getByText(/已验证 2 个文件/).waitFor();await dialog.getByRole('checkbox',{name:'已核对来源和文件清单，导入到当前空间。'}).check();await dialog.getByRole('button',{name:'导入独立副本',exact:true}).click();await dialog.getByText(/已导入 2 个独立快照/).waitFor();const imported=app.store.list('versions').filter(v=>v.metadata.share);assert.equal(imported.length,2);checks.push('inspect and import as fresh resources');
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'评测报告',exact:true}).click();await page.getByRole('button',{name:/Synthetic report.*原始口径/}).first().click();dialog=page.getByRole('dialog');await dialog.getByRole('img',{name:'Example pixel',exact:true}).waitFor();await page.waitForFunction(()=>{const image=document.querySelector('.resource-document img');return image?.complete&&image.naturalWidth>0;});await page.screenshot({path:new URL('imported-report.png',evidence).pathname});checks.push('imported Markdown resolves its package image');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('mobile.png',evidence).pathname});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('mobile viewport without horizontal page overflow');assert.deepEqual(errors,[]);
 const result={passed:true,checks,pageErrors:errors,inferencePerformed:false};writeFileSync(new URL('browser-checks.json',evidence),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){if(browser){const pages=browser.contexts().flatMap(c=>c.pages());if(pages[0])await pages[0].screenshot({path:new URL('failure.png',evidence).pathname});}throw error;}finally{await browser?.close();await app.close();rmSync(root,{recursive:true,force:true});}

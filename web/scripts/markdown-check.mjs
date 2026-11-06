import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
await mkdir('.markdown-check',{recursive:true});
await build({entryPoints:['src/components/Markdown.tsx'],bundle:true,packages:'external',platform:'node',format:'esm',outfile:'.markdown-check/renderer.mjs',jsx:'automatic'});
const {renderMarkdown}=await import('../.markdown-check/renderer.mjs');
const render=text=>renderToStaticMarkup(renderMarkdown(text));
const checks=[];function check(name,fn){fn();checks.push(name);console.log('PASS '+name);}
check('GFM table and original template heading order',()=>{const s=render('# 结论\n\n| ID | 证据 |\n| --- | --- |\n| a | OK |\n\n# 边界');assert.match(s,/<table[^>]*>/);assert.match(s,/<td>a<\/td>/);assert.ok(s.indexOf('结论')<s.indexOf('边界'));});
check('lists, emphasis, inline code and fenced code remain readable',()=>{const s=render('- **bold**\n- `inline`\n\n```js\nconst x = "<tag>";\n```');assert.match(s,/<strong>bold<\/strong>/);assert.match(s,/<code>inline<\/code>/);assert.match(s,/&lt;tag&gt;/);assert.match(s,/复制/);});
check('raw HTML, scripts and JavaScript URL never produce active markup',()=>{const s=render('<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n\n[bad](javascript:alert%281%29)');assert.doesNotMatch(s,/<script|onerror|href="javascript:|<img/);});
check('HTTPS and relative artifact links survive; unsafe schemes and remote images do not',()=>{const s=render('[web](https://example.com) [file](outputs/run/report.md) [bad](data:text/html,test)\n\n![remote](https://example.com/image.png)');assert.match(s,/href="https:\/\/example.com"/);assert.match(s,/href="outputs\/run\/report.md"/);assert.doesNotMatch(s,/<img|href="data:/);});
check('long reports preserve end content without truncation',()=>{const s=render('# Report\n\n'+Array.from({length:300},(_,i)=>`- Evidence ${i}`).join('\n')+'\n\n## Final boundary');assert.match(s,/Evidence 299/);assert.match(s,/Final boundary/);});
await writeFile('.markdown-check/results.json',JSON.stringify({checks,passed:checks.length},null,2));
await build({entryPoints:['src/components/ArtifactPanel.tsx'],bundle:true,packages:'external',platform:'node',format:'esm',outfile:'.markdown-check/artifact.mjs',jsx:'automatic'});
const {ArtifactPanel}=await import('../.markdown-check/artifact.mjs');
const {createElement}=await import('react');
const panel=(mime,extra={})=>renderToStaticMarkup(createElement(ArtifactPanel,{artifact:{id:'a',title:'fixture',mimeType:mime,previewUrl:'/api/artifacts/a/preview',...extra},artifacts:[],onSelect:()=>{},onClose:()=>{}}));
check('PNG artifact preview is an image, not binary text',()=>{assert.match(panel('image/png'),/<img[^>]+src="\/api\/artifacts\/a\/preview"/);assert.doesNotMatch(panel('image/png'),/<pre>/);});
check('unsupported binary preview gives a download explanation',()=>{assert.match(panel('application/octet-stream'),/暂不支持内嵌预览/);assert.doesNotMatch(panel('application/octet-stream'),/正在读取产物/);});
await writeFile('.markdown-check/results.json',JSON.stringify({checks,passed:checks.length},null,2));

check('JSONL artifact remains readable text',()=>{assert.match(panel('application/x-ndjson'),/<pre>/);assert.doesNotMatch(panel('application/x-ndjson',{content:'{}'}),/暂不支持内嵌预览/);});
await writeFile('.markdown-check/results.json',JSON.stringify({checks,passed:checks.length},null,2));

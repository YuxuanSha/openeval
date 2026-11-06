import { probe } from '../server/runtime.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const result = await probe(process.cwd());
mkdirSync('evidence',{recursive:true});
writeFileSync(join('evidence','runtime-probe.json'),JSON.stringify({...result,checkedAt:new Date().toISOString(),inferenceRequested:false},null,2));
console.log(JSON.stringify(result,null,2));

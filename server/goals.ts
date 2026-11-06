import { AppError } from './store.ts';
export interface GoalMode { objective:string; tokenBudget?:number|null; deadlineSeconds?:number|null; maxTurns?:number|null; origin:'user'|'automatic' }
export function parseGoalMode(value:any):GoalMode|null {
  if(value===undefined||value===null||value===false)return null;
  if(typeof value!=='object'||typeof value.objective!=='string'||!value.objective.trim()||value.objective.length>3500)throw new AppError(400,'GOAL_OBJECTIVE','目标模式需要明确目标（最多3500字）');
  // Retain explicit legacy API bounds, but never invent a budget for a new goal.
  const bounded=(key:string,min:number,max:number)=>{const number=value[key];if(number===undefined||number===null)return null;if(!Number.isSafeInteger(number)||number<min||number>max)throw new AppError(400,'GOAL_BOUND',`${key} 必须在 ${min}–${max} 之间`);return number;};
  if(value.origin!==undefined&&!['user','automatic'].includes(value.origin))throw new AppError(400,'GOAL_ORIGIN','目标来源无效');
  return {objective:value.objective.trim(),tokenBudget:bounded('tokenBudget',1000,200000),deadlineSeconds:bounded('deadlineSeconds',30,900),maxTurns:bounded('maxTurns',1,20),origin:value.origin??'automatic'};
}
// UI events retain protocol identities, but never hidden reasoning or common credential forms.
export function redactEvent(value:any):any {
  if(typeof value==='string')return value.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer [redacted]').replace(/\bsk-[A-Za-z0-9_-]{16,}/g,'[redacted]').replace(/((?:access_token|refresh_token|api_key|password|x-orig-sign|x-orig-authkey)["']?\s*[:=]\s*["']?)[^\s&"'<>]+/gi,'$1[redacted]');
  if(Array.isArray(value))return value.filter(item=>item?.type!=='reasoning').map(redactEvent);
  if(value&&typeof value==='object'&&value.type==='reasoning')return {type:'reasoning',redacted:true};
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['encryptedContent','rawContent','reasoning'].includes(key)).map(([key,item])=>[key,/^(?:access_?token|refresh_?token|api_?key|password|client_?secret|authorization)$/i.test(key)?'[redacted]':redactEvent(item)]));
  return value;
}

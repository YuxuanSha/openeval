import type { ChatMessage, MessagePart, RunActivity, RunEvent } from '../contract';

/** Completion updates replace in place; they must not move earlier steps to the end. */
export function upsertActivity(all: RunActivity[], activity: RunActivity): RunActivity[] {
  const index = all.findIndex(item => item.id === activity.id);
  if (index < 0) return [...all, activity];
  return all.map((item, at) => at === index ? {...activity, at:item.at || activity.at} : item);
}

export function upsertPart(parts: MessagePart[] = [], part: MessagePart) {
  return parts.some(item => item.id === part.id) ? parts.map(item => item.id === part.id ? part : item) : [...parts, part];
}

export function messagePresentation(message: ChatMessage, running: boolean) {
  const parts = message.parts?.filter(part => part.text);
  if (!parts?.length) return { answer:message.text, steps:[] as MessagePart[] };
  const finals = parts.filter(part => part.phase === 'final_answer');
  // Older CLI versions lack phase: show the last item as the answer after completion.
  // Never split prose by guessing at its content. All parts remain in the trace.
  const answers = finals.length ? finals : running ? [] : parts.at(-1)?.phase === 'commentary' ? [] : [parts.at(-1)!];
  return { answer:answers.map(part => part.text).join('\n\n'), steps:parts.filter(part => !answers.includes(part)) };
}

export type Interaction = Extract<RunEvent,{type:'approval'|'input'}>;
export function pendingState(pending:Interaction[]) {
  const next=pending[0];
  return {pending,status:next?.type || 'running' as const,approval:next?.type==='approval'?next:undefined,inputRequest:next?.type==='input'?next:undefined};
}

export type TraceEntry = {kind:'activity';id:string;activity:RunActivity} | {kind:'tools';id:string;items:RunActivity[]};
/** Fold only adjacent tools. Never move commentary, failures, or pending requests. */
export function traceEntries(activities:RunActivity[]):TraceEntry[] {
  const entries:TraceEntry[]=[];
  for (const activity of activities) {
    // The final answer already occupies the conversation; it stays in raw/exported records.
    if (activity.kind==='message' && activity.phase==='final_answer') continue;
    if (['command','file','tool'].includes(activity.kind) && activity.state==='complete') {
      const last=entries.at(-1);
      if (last?.kind==='tools') last.items.push(activity);
      else entries.push({kind:'tools',id:activity.id,items:[activity]});
    } else entries.push({kind:'activity',id:activity.id,activity});
  }
  return entries;
}

export function traceDuration(start:string,end?:string):string {
  const elapsed=Date.parse(end || '')-Date.parse(start);
  if (!Number.isFinite(elapsed) || elapsed<=0) return '';
  const seconds=Math.max(1,Math.round(elapsed/1000));
  if (seconds<60) return `${seconds}s`;
  if (seconds<3600) return `${Math.floor(seconds/60)}m ${seconds%60}s`;
  return `${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`;
}

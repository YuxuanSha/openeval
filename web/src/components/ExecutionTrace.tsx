import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, FileText, LoaderCircle, Search, ShieldCheck, Terminal, Wrench } from 'lucide-react';
import { adapter } from '../adapters';
import type { RunActivity, RunRecord, Task } from '../contract';
import { upsertActivity, traceEntries, traceDuration } from '../state/trace';
import { GoalStatus } from './GoalMode';
import type { RunState } from './Workspace';
import './ExecutionTrace.css';

const states: Record<string,string> = { running:'正在处理', queued:'准备中', waiting:'等待补充', complete:'执行已结束', completed:'执行已结束', cancelled:'已停止', failed:'已中断', interrupted:'已中断', approval:'等待审批', input:'等待输入', disconnected:'连接已中断', idle:'已记录' };
const itemStates: Record<RunActivity['state'],string> = {pending:'待处理',running:'执行中',complete:'已完成',failed:'失败',declined:'已拒绝'};

export function ExecutionTrace({ task, run, record = task.lastRun! }: {task:Task; run:RunState; record?:RunRecord}) {
  const [open,setOpen] = useState(false);
  const [replayed,setReplayed] = useState<RunActivity[]>([]);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);
  const [replayStatus,setReplayStatus] = useState('');
  const [attempt,setAttempt] = useState(0);
  const [query,setQuery] = useState('');
  const [limit,setLimit] = useState(80);
  const id = useId(); const heading = useRef<HTMLButtonElement>(null);
  const latest = record.id === task.lastRun?.id;
  const live = latest && run.activities !== undefined && run.status !== 'disconnected';
  const status = latest && run.status !== 'idle' ? run.status : replayStatus || record.status;
  const active = ['running','queued'].includes(status);
  useEffect(() => {
    if (live) {setError('');setLoading(false);return;}
    if (!open) return;
    const abort = new AbortController(); setError(''); setLoading(true);
    (async () => {
      try {
        for await (const event of adapter.activity(record.id,abort.signal)) {
          if (abort.signal.aborted) return;
          if (event.type === 'activity') setReplayed(all => upsertActivity(all,event.activity));
          else if (event.type === 'warning') setError(event.message);
          else setReplayStatus(event.status);
        }
      } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => abort.abort();
  },[open,live,record.id,attempt]);
  const activities = live ? run.activities! : latest && run.activities ? replayed.reduce(upsertActivity,run.activities) : replayed;
  const entries = traceEntries(activities);
  const filtered = query ? activities.filter(a => `${a.title}\n${a.detail || ''}`.toLowerCase().includes(query.toLowerCase())) : [];
  const preview = active ? [...activities].reverse().find(a => a.state === 'running' && a.kind !== 'message')?.title || (latest ? run.progress?.label : '') : '';
  const duration = ['complete','completed'].includes(status) ? traceDuration(record.createdAt,record.updatedAt) : '';
  const label = duration ? `用时 ${duration}` : states[status] || status;
  const close = () => { heading.current?.focus({preventScroll:true}); setOpen(false); };
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({runId:record.id,status,activities},null,2)],{type:'application/json'}));
    const link = document.createElement('a'); link.href=url; link.download=`trace-${record.id}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="execution-trace" data-run-id={record.id} onKeyDown={e => { if (e.key==='Escape' && open) { e.stopPropagation(); close(); } }}>
    <button ref={heading} className="trace-heading" aria-label={`执行过程：${label}`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>
      {active && <LoaderCircle size={14} className="spin"/>}<span>{label}</span><ChevronDown size={15} className={open?'':'folded'}/>
      {!open && preview && <span className="trace-preview">{preview}</span>}
    </button>
    <span className="sr-only" role="status">{states[status] || status}</span>
    {open && <div className="trace-body" id={id}>
      <div className="trace-flow" role="region" aria-label="执行过程">
        {entries.map(entry => entry.kind==='tools'
          ? <ToolGroup key={entry.id} items={entry.items} active={active}/>
          : entry.activity.kind==='message'
            ? <div className="trace-commentary" key={entry.id}>{entry.activity.detail || entry.activity.title}</div>
            : <TraceItem key={entry.id} activity={entry.activity} active={active}/>)}
        {!entries.length && <p className="trace-empty">{loading?'正在读取执行记录…':'这轮暂无工具或阶段记录。'}</p>}
      </div>
      {error && <div className="trace-error" role="status"><p>{error}</p><button className="text-button" onClick={()=>setAttempt(a=>a+1)}>重新读取记录</button></div>}
      {record.goalMode && <GoalStatus task={{...task,lastRun:record}} run={latest?run:{status:'idle'}}/>}
      <details className="trace-utilities">
        <summary>查找与导出<ChevronDown size={12}/></summary>
        <div className="trace-tools"><span>{activities.length} 项记录 · {record.model || '本机 Codex'}{record.reasoning && ` · ${record.reasoning}`}</span><button className="text-button" onClick={download} disabled={!activities.length}>导出已加载记录</button>{record.traceUrl && <a className="text-button" href={record.traceUrl} download>下载原始事件</a>}</div>
        <label className="trace-search"><Search size={14}/><input aria-label="搜索执行过程" placeholder="搜索命令、说明或输出" value={query} onChange={e=>{setQuery(e.target.value);setLimit(80);}}/></label>
        {query && <div className="trace-search-results" role="region" aria-label="执行过程搜索结果" tabIndex={0}><p className="trace-empty">{filtered.length} 项匹配</p>{filtered.slice(0,limit).map(a=><TraceItem key={a.id} activity={a} active={active}/>)}{filtered.length>limit && <button className="trace-more" onClick={()=>setLimit(limit+80)}>继续显示 · 还有 {filtered.length-limit} 项</button>}</div>}
      </details>
    </div>}
  </section>;
}

function ToolGroup({items,active}:{items:RunActivity[];active:boolean}) {
  const [expanded,setExpanded] = useState(false); const [limit,setLimit] = useState(80);
  // Keep the first and latest steps visible. Only the middle of a long uninterrupted
  // tool sequence is folded; commentary and requests retain their chronological place.
  const long = items.length>8;
  const middle = long ? items.slice(2,-2) : [];
  return <div className="trace-tool-group">
    {(long?items.slice(0,2):items).map(a=><TraceItem key={a.id} activity={a} active={active}/>)}
    {long && <details className="trace-archive" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}>
      <summary><ChevronDown size={13}/><span>另 {middle.length} 项工具记录</span></summary>
      {expanded && <div className="trace-archive-list" role="region" aria-label="较早的工具记录" tabIndex={0}>{middle.slice(0,limit).map(a=><TraceItem key={a.id} activity={a} active={active}/>)}{middle.length>limit && <button className="trace-more" onClick={()=>setLimit(limit+80)}>继续显示 · 还有 {middle.length-limit} 项</button>}</div>}
    </details>}
    {long && items.slice(-2).map(a=><TraceItem key={a.id} activity={a} active={active}/>)}
  </div>;
}

function TraceItem({activity:a,active}:{activity:RunActivity;active:boolean}) {
  const [open,setOpen] = useState(false); const [full,setFull] = useState(false);
  const Icon = a.kind==='command'?Terminal:a.kind==='file'?FileText:['approval','input'].includes(a.kind)?ShieldCheck:Wrench;
  const time = a.at && !Number.isNaN(Date.parse(a.at)) ? new Date(a.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';
  const state = a.state==='running'&&!active?'未记录结束':itemStates[a.state];
  const noteworthy = a.state !== 'complete';
  return <details className={`trace-item state-${a.state}`} open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>{a.state==='running'&&active?<LoaderCircle className="spin" size={15}/>:<Icon size={15}/>}<span className="trace-item-title">{a.title}</span>{noteworthy && <span className="trace-item-state">{state}</span>}<ChevronDown className="item-chevron" size={12}/></summary>
    {open && <div className="trace-detail"><div className="trace-detail-title">{a.title}</div><div className="trace-detail-meta"><time dateTime={a.at}>{time}</time><span>{state}</span></div>{a.detail?<><pre tabIndex={0} aria-label={`${a.title} 输出`}>{full?a.detail:a.detail.slice(0,12000)}</pre>{a.detail.length>12000 && <button className="text-button" onClick={()=>setFull(!full)}>{full?'显示摘要':`展开完整输出 · ${a.detail.length.toLocaleString()} 字符`}</button>}</>:<p>本次事件没有提供更多输出。</p>}</div>}
  </details>;
}

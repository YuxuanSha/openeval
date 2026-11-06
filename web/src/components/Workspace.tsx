import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, CircleHelp, FileText, LoaderCircle, RotateCcw, ShieldCheck, Square } from 'lucide-react';
import type { Artifact, Capabilities, Intent, Resource, ResourceRef, Task, RunActivity, GoalMode, GoalState, RunEvent } from '../contract';
import { intentLabels } from '../contract';
import { RefChip, ArtifactCard } from './Shared';
import { renderMarkdown } from './Markdown';
import { messagePresentation } from '../state/trace';
import { ExecutionTrace } from './ExecutionTrace';
import { ComposerControls, GoalInput } from './ComposerControls';
import { ReferencePicker } from './ReferencePicker';
export type RunState = { pending?: Extract<RunEvent,{type:'approval'|'input'}>[]; status: 'idle' | 'running' | 'disconnected' | 'failed' | 'complete' | 'cancelled' | 'approval' | 'input' | 'waiting'; goal?: GoalState | null; turnCount?: number; turnStatus?: 'running' | 'completed'; turnId?: string; stopReason?: string; progress?: { step: number; total: number; label: string }; error?: string; warning?: string; activities?: RunActivity[]; resumable?: boolean; approval?: { id: string; action: string; reason: string }; questions?: string[]; inputRequest?: { id: string; questions: { id: string; question: string; options?: string[] }[] } };
const starts: { intent: Intent; prompt: string }[] = [
  { intent: 'standard', prompt: '一起构建一份评测标准，先明确评测对象、使用场景和判定依据。' },
  { intent: 'dataset', prompt: '帮我构建评测集，先确认场景覆盖、评测单位和样本来源。' },
  { intent: 'evaluate', prompt: '按我引用的标准评测这批产物，先检查可评范围和证据完整性。' },
  { intent: 'analyze', prompt: '分析我引用的已有评分结果，保留原始分数和统计口径，不新增评分。' },
  { intent: 'report', prompt: '根据已有评测结果撰写报告，沿用我引用的报告模板。' },
];
export function Workspace({ task, resources, capabilities, input, setInput, onIntent, onReference, onRemoveRef, onInspect, onSend, onCancel, onResume, onApproval, onInputAnswer, run, onArtifact, onImport, model, setModel, reasoning, setReasoning, onRuntime, creating, goalMode, setGoalMode }: {
  goalMode?: GoalMode | null; setGoalMode: (mode: GoalMode | null) => void;
  task: Task; resources: Resource[]; capabilities?: Capabilities; input: string; setInput: (v: string) => void; onIntent: (v: Intent) => void;
  onReference: (v: ResourceRef) => void; onRemoveRef: (v: ResourceRef) => void; onInspect: (v: ResourceRef) => void;
  onSend: () => void; onCancel: () => void; onResume: () => void; onApproval: (approved: boolean) => void; onInputAnswer: (answers: Record<string, { answers: string[] }>) => void;
  run: RunState; onArtifact: (a: Artifact) => void; onImport: () => void;
  model: string; setModel: (s: string) => void; reasoning: string; setReasoning: (s: string) => void; onRuntime: () => void; creating: boolean;
}) {
  const [picker, setPicker] = useState(false); const [examples, setExamples] = useState(false);
  const [unavailableLink, setUnavailableLink] = useState<{ messageId: string; path: string } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null); const end = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null); const following = useRef(true); const attention = useRef<HTMLDivElement>(null);
  const [newContent,setNewContent] = useState(false);
  const busy = ['running', 'approval', 'input', 'disconnected'].includes(run.status); const empty = !task.messages.length;
  useLayoutEffect(() => { following.current=true; setNewContent(false); if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight; },[task.id]);
  useLayoutEffect(() => { if(empty)return; if(following.current && scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight; else setNewContent(true); },[task.messages,run.status,run.activities?.length,empty]);
  const jumpToLatest = () => { following.current=true; setNewContent(false); if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight; };
  const traced = new Set<string>();
  useEffect(() => { setPicker(false); setExamples(false); setUnavailableLink(null); }, [task.id]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPicker(false); setExamples(false); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, []);
  const canSend = !!input.trim() && !creating && !!capabilities && capabilities.connected && (!goalMode || capabilities.goals?.supported === true);
  return <div className={`workspace ${empty ? 'is-empty' : ''}`}>
    {!empty && <div ref={scroll} className="conversation-scroll" onPointerDown={()=>{following.current=false;}} onWheel={e=>{if(e.deltaY<0)following.current=false;}} onKeyDown={e=>{if(['ArrowUp','PageUp','Home','Tab'].includes(e.key))following.current=false;}} onScroll={e=>{const el=e.currentTarget;following.current=el.scrollHeight-el.scrollTop-el.clientHeight<60;if(following.current)setNewContent(false);}}><div className="conversation">{task.messages.map(m => {
        const record = m.role==='assistant' ? task.runs?.find(r=>r.id===m.runId) || (m.runId===task.lastRun?.id?task.lastRun:undefined) : undefined;
        const showTrace = record && !traced.has(record.id); if(record)traced.add(record.id);
        const presentation = m.role==='assistant'?messagePresentation(m,busy&&m.runId===task.lastRun?.id):{answer:m.text};
        return <Fragment key={showTrace?`response:${record.id}`:m.id}>{showTrace && <ExecutionTrace key={record.id} task={task} run={run} record={record}/>}<article hidden={m.role==='assistant'&&!presentation.answer}  data-run-id={m.runId} className={`message message-${m.role}`}><div className="message-body">{presentation.answer ? m.role === 'assistant' ? renderMarkdown(presentation.answer, { onLinkClick: (href, event) => { if (!/^https?:/i.test(href)) { event.preventDefault(); try { href = decodeURIComponent(href); } catch {} const a = task.artifacts.find(a => href === a.title || href.endsWith('/' + a.title) || (!!a.sourcePath && (href === a.sourcePath || href.endsWith('/' + a.sourcePath)))); if (a) { setUnavailableLink(null); onArtifact(a); } else setUnavailableLink({ messageId: m.id, path: href }); } } }) : presentation.answer : busy && <span className="typing-indicator">正在处理…</span>}</div>{unavailableLink?.messageId === m.id && <div className="notice soft" role="status"><CircleHelp size={16}/><span>该链接尚未对应已保存的任务产物：<code>{unavailableLink.path}</code>。可在产物列表查看已保存文件，或请 Agent 将该文件归档。</span></div>}{!!m.refs?.length && <ReferenceGroup references={m.refs} resources={resources} onInspect={onInspect}/>}</article></Fragment>;})}
      {(task.runs || (task.lastRun?[task.lastRun]:[])).filter(record=>!traced.has(record.id)).map(record=><ExecutionTrace key={record.id} task={task} run={run} record={record}/>)}
      {run.progress && !task.lastRun && <div className="run-progress" role="status"><span className="progress-icon">{busy ? <LoaderCircle className="spin" size={16} /> : run.status === 'complete' ? <Check size={16} /> : <CircleHelp size={16} />}</span><span>{run.status === 'complete' ? '本次执行已结束' : run.progress.label}</span>{run.progress.total > 0 && <code>{run.progress.step} / {run.progress.total}</code>}<>{run.progress.total > 0 && <div className="progress-track"><i style={{ width: `${100 * run.progress.step / run.progress.total}%` }} /></div>}</></div>}
      {run.approval && run.status === 'approval' && <div ref={attention} tabIndex={-1} className="notice approval" role="region" aria-label="待处理审批"><ShieldCheck size={20} /><div><strong>{run.approval.action}</strong><p>{run.approval.reason}</p><div className="button-row"><button className="primary small" onClick={() => onApproval(true)}>{capabilities?.mode === 'demo' ? '允许本次演示' : '允许本次操作'}</button><button className="secondary small" onClick={() => onApproval(false)}>拒绝</button></div></div></div>}
      {run.status === 'input' && run.inputRequest && <div ref={attention} tabIndex={-1}><InputRequest key={run.inputRequest.id} questions={run.inputRequest.questions} onAnswer={onInputAnswer} /></div>}
      {run.status === 'waiting' && <div className="notice"><CircleHelp size={18} /><div><strong>需要补充任务依据</strong>{run.questions?.map(q => <p key={q}>{q}</p>)}<p>补充引用或说明后，直接在下方继续对话。</p></div></div>}
      {run.warning && <div className="notice" role="status">{run.warning}</div>}
      {run.status === 'disconnected' && <div ref={attention} tabIndex={-1} className="notice"><CircleHelp size={18}/><div><strong>事件连接尚未恢复</strong><p>{run.error || '服务端运行记录仍保留，恢复连接以继续查看和操作。'}</p><button className="secondary small" onClick={onResume}><RotateCcw size={14}/>恢复连接</button></div></div>}
      {run.status === 'failed' && <div className="notice error" role="alert"><CircleHelp size={19} /><div><strong>任务中断</strong><p>{run.error}</p>{run.resumable && <button className="secondary small" onClick={onResume}><RotateCcw size={14} />恢复任务</button>}</div></div>}
      {run.status === 'cancelled' && <div className="notice">本次执行已停止，消息与引用仍保留。</div>}
      {task.artifacts.length > 0 && <section className="artifact-section"><div className="section-label">本轮产物<button className="text-button" onClick={()=>onArtifact(task.artifacts.at(-1)!)}>查看全部 {task.artifacts.length}</button></div><div className="artifact-grid">{task.artifacts.filter(a=>a.runId===task.lastRun?.id).map(a=><ArtifactCard key={a.id} artifact={a} onPreview={()=>onArtifact(a)}/>)}</div></section>}<div ref={end} /></div></div>}
    {(['approval','input','disconnected'].includes(run.status) || newContent) && <div className="conversation-status" role="status">{['approval','input','disconnected'].includes(run.status)?<button onClick={()=>{attention.current?.scrollIntoView({block:'nearest'});attention.current?.focus({preventScroll:true});}}>{run.status==='approval'?`等待你确认权限${(run.pending?.length || 0)>1?` · 共 ${run.pending!.length} 个请求`:''}`:run.status==='input'?'等待你补充信息':'连接中断，记录已保留'} · 查看</button>:<button onClick={jumpToLatest}>有新内容 · 回到最新</button>}</div>}
    <div className="composer-wrap">{empty && <div className="workspace-intro"><h1>{creating && !task.id ? '正在读取会话…' : '新任务'}</h1><p>描述目标，或输入 @ 引用你的资料</p></div>}
      <div className="composer-frame"><div className={`composer ${picker ? 'picker-open' : ''}`}>
        {task.refs.length > 0 && <ReferenceGroup key={task.id} references={task.refs} resources={resources} onInspect={onInspect} onRemove={busy?undefined:onRemoveRef} composer/>}
        {picker && <ReferencePicker resources={resources} selected={task.refs} onSelect={onReference} onClose={() => { setPicker(false); setInput(input.replace(/@$/, '')); textarea.current?.focus(); }} />}
        <textarea ref={textarea} value={input} onChange={e => { setInput(e.target.value); if (e.target.value.endsWith('@')) setPicker(true); }} placeholder="你想评测什么？" aria-label="任务输入" disabled={busy || creating} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !picker) { e.preventDefault(); if (canSend && !busy) onSend(); } }} />
        <GoalInput value={goalMode} onChange={setGoalMode} disabled={busy || creating}/>
        <div className="composer-toolbar"><ComposerControls key={task.id} capabilities={capabilities} disabled={busy || creating} model={model} reasoning={reasoning} intent={task.intent} goal={goalMode} onModel={setModel} onReasoning={setReasoning} onIntent={onIntent} onGoal={setGoalMode} onImport={onImport} onReference={() => setPicker(true)} onRuntime={onRuntime}/><div className="toolbar-right">{run.status === 'disconnected' ? <button className="send-button" onClick={onResume} aria-label="恢复事件连接"><RotateCcw size={15}/></button> : busy ? <button className="send-button stop" onClick={onCancel} aria-label="停止执行"><Square size={14} fill="currentColor" /></button> : <button className="send-button" onClick={onSend} disabled={!canSend} aria-label="发送任务">{creating ? <LoaderCircle className="spin" size={18} /> : <ArrowUp size={20} />}</button>}</div></div>
      </div><div className="composer-context"><FileText size={12} /><span>{task.refs.length ? `${task.refs.length} 份引用 · 版本已选定` : '当前工作区'}</span><span>Enter 发送</span></div></div>
      {empty && <div className="example-area"><button className="example-toggle" onClick={() => setExamples(!examples)}>试试一个示例 <ChevronDown size={12} className={examples ? 'rotated' : ''} /></button>{examples && <div className="example-menu">{starts.map(s => <button key={s.intent} onClick={() => { onIntent(s.intent); setInput(s.prompt); setExamples(false); textarea.current?.focus(); }}>{intentLabels[s.intent]}<span>{s.prompt}</span></button>)}</div>}</div>}
    </div>
  </div>;
}
function InputRequest({ questions, onAnswer }: { questions: { id: string; question: string; options?: string[] }[]; onAnswer: (answers: Record<string, { answers: string[] }>) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  return <div className="notice input-request"><div><strong>Codex 需要补充信息</strong>{questions.map(q => <label key={q.id}>{q.question}{q.options && <select aria-label={`${q.question} 选项`} value={q.options.includes(answers[q.id]) ? answers[q.id] : ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })}><option value="">选择建议或自行填写</option>{q.options.map(o => <option key={o}>{o}</option>)}</select>}<input aria-label={q.question} value={answers[q.id] || ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} /></label>)}<button className="primary small" disabled={questions.some(q => !answers[q.id]?.trim())} onClick={() => onAnswer(Object.fromEntries(questions.map(q => [q.id, { answers: [answers[q.id]] }])))}>提交补充</button></div></div>;
}

function ReferenceGroup({references,resources,onInspect,onRemove,composer=false}:{references:ResourceRef[];resources:Resource[];onInspect:(ref:ResourceRef)=>void;onRemove?:(ref:ResourceRef)=>void;composer?:boolean}) {
  const chips=<div className={composer?'selected-refs':'message-refs'}>{references.map(ref=><RefChip key={ref.snapshotId} reference={ref} resources={resources} onInspect={()=>onInspect(ref)} onRemove={onRemove?()=>onRemove(ref):undefined}/>)}</div>;
  return references.length>3?<details className={`reference-group ${composer?'composer-references':''}`}><summary>{references.length} 份引用 · 版本已选定<ChevronDown size={13}/></summary>{chips}</details>:chips;
}

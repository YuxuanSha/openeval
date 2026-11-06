import { useCallback, useEffect, useRef, useState } from 'react';
import { adapter, isDemo } from '../adapters';
import { upsertActivity, upsertPart, pendingState } from './trace';
import type { GoalMode, Intent, ResourceRef, RunEvent, Task } from '../contract';
import type { RunState } from '../components/Workspace';

const blank = (): Task => ({ id: '', title: '新任务', intent: 'chat', messages: [], refs: [], artifacts: [] });
const routeId = () => decodeURIComponent(location.pathname.match(/^\/tasks\/([^/]+)/)?.[1] || '');
type Draft = { input: string; refs?: ResourceRef[]; intent?: Intent; goalMode?: GoalMode | null };
const busyState = (state?: RunState) => !!state && ['running', 'approval', 'input', 'disconnected'].includes(state.status);
/** Server sessions are canonical; browser storage contains unsent drafts only. */
export function useSessions(onError: (message: string) => void) {
  const [tasks, setTasks] = useState<Task[]>([]); const [active, setActive] = useState(routeId);
  const [creating, setCreating] = useState(false);
  const [states, setStates] = useState<Record<string, RunState>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => { try { return JSON.parse(localStorage.getItem('openeval-drafts-v3') || '{}'); } catch { return {}; } });
  const controls = useRef(new Map<string, { abort: AbortController; runId: string; assistant: string; cancel: boolean; sourceId: string | null; generation: number; goalMode?: GoalMode | null }>());
  const generations = useRef(new Map<string, number>());
  const createRequest = useRef<string | undefined>(undefined);
  const base = tasks.find(t => t.id === active) || blank(); const draft = drafts[active];
  const current = { ...base, refs: draft?.refs ?? base.refs, intent: draft?.intent ?? base.intent };
  const upsert = useCallback((task: Task) => setTasks(all => [task, ...all.filter(t => t.id !== task.id)]), []);
  const setState = (id: string, update: (s: RunState) => RunState) => setStates(all => ({ ...all, [id]: update(all[id] || { status: 'idle' }) }));
  const update = (fn: (t: Task) => Task, id = active) => id ? setTasks(all => all.map(t => t.id === id ? fn(t) : t)) : undefined;
  const navigate = useCallback((id: string, replace = false) => { setActive(id); const path = id ? `/tasks/${encodeURIComponent(id)}` : '/'; if (location.pathname !== path) history[replace ? 'replaceState' : 'pushState']({}, '', path); }, []);
  const load = useCallback(async (id: string) => {
    const generation = generations.current.get(id) || 0; const task = await adapter.getTask(id);
    if (generation !== (generations.current.get(id) || 0) || controls.current.has(id)) return task;
    upsert(task);
    const last = task.lastRun;
    if(last?.status==='waiting' && last.goalMode) setDrafts(all=>({...all,[id]:{...all[id],input:all[id]?.input || '',goalMode:all[id]?.goalMode===undefined?last.goalMode:all[id].goalMode}}));
    if (last && !controls.current.has(id)) setStates(all => ({ ...all, [id]: last.status === 'completed' ? { status: 'complete' } : last.status === 'cancelled' ? { status: 'cancelled' } : last.status === 'waiting' && task.contract?.unresolved.length ? { status: 'waiting', questions: task.contract.unresolved } : ['queued','running','waiting'].includes(last.status) ? { status: 'disconnected', resumable: true } : { status: 'failed', error: last.error || '已有运行记录。恢复任务可查看最新状态。', resumable: true } }));
    return task;
  }, [upsert]);
  useEffect(() => { adapter.listTasks().then(loaded => setTasks(existing => [...new Map([...loaded, ...existing].map(t => [t.id, t])).values()])).catch(e => onError(e.message)); if (routeId()) load(routeId()).catch(e => onError(e.message)); const pop = () => { const id = routeId(); setActive(id); if (id && !controls.current.has(id)) load(id).catch(e => onError(e.message)); }; window.addEventListener('popstate', pop); return () => { window.removeEventListener('popstate', pop); controls.current.forEach(c => c.abort.abort()); }; }, [load, onError]);
  useEffect(() => { try { localStorage.setItem('openeval-drafts-v3', JSON.stringify(drafts)); } catch { /* Draft caching is optional; server tasks remain available. */ } }, [drafts]);
  async function create(intent: Intent = 'chat') {
    if (creating) return;
    setCreating(true); createRequest.current ||= crypto.randomUUID();
    try { const t = await adapter.createTask(intent, createRequest.current, current.projectId); createRequest.current = undefined; upsert(t); navigate(t.id); return t; }
    catch (e) { onError((e as Error).message); return; } finally { setCreating(false); }
  }
  async function select(id: string) { navigate(id); if (!controls.current.has(id)) { try { await load(id); } catch (e) { onError((e as Error).message); } } }
  async function consume(events: AsyncIterable<RunEvent>, id: string, control: { abort: AbortController; runId: string; assistant: string; cancel: boolean; sourceId: string | null; generation: number; goalMode?: GoalMode | null }) {
    try {
      for await (const e of events) {
        if (e.type === 'started') { if (control.sourceId !== null) setDrafts(all => { const next = { ...all }; delete next[control.sourceId!]; delete next[id]; return next; }); control.runId = e.runId; update(t => { const record = { id: e.runId, status: 'running', model: e.model, reasoning: e.reasoning, createdAt: e.createdAt || '' }; return { ...t, lastRun: record, messages:t.messages.map(m => m.id === control.assistant ? {...m, runId:e.runId} : m), runs: t.runs?.some(r=>r.id===e.runId) ? t.runs : [...(t.runs || []), record] }; }, id); if (control.cancel) { try { await adapter.cancel(e.runId); control.abort.abort(); setState(id, () => ({ status: 'cancelled' })); break; } catch (error) { onError((error as Error).message); } } }
        if (e.type === 'activity') setState(id, s => ({ ...s, activities: upsertActivity(s.activities || [], e.activity) }));
        if (e.type === 'messagePart') update(t => ({...t, messages:t.messages.map(m => m.id === control.assistant ? {...m, parts:upsertPart(m.parts, e.part)} : m)}), id);
        if (e.type === 'disconnected') setState(id, s => ({...s,status:'disconnected',error:e.message,resumable:true}));
        if (e.type === 'warning') setState(id, s => ({ ...s, warning: e.message }));
        if (e.type === 'running') setState(id, s => ({ ...s, ...pendingState(s.pending || []) }));
        if (e.type === 'contract') { control.goalMode = e.contract.goalMode; update(t => ({ ...t, contract: e.contract, lastRun: t.lastRun ? {...t.lastRun, goalMode:e.contract.goalMode} : undefined }), id); }
        if (e.type === 'goal') { setState(id,s=>({...s,goal:e.goal})); update(t=>({...t,lastRun:t.lastRun?{...t.lastRun,goalState:e.goal}:undefined}),id); }
        if (e.type === 'turn') setState(id,s=>({...s,turnCount:e.count ?? s.turnCount,turnStatus:e.status,turnId:e.turnId}));
        if (e.type === 'goalLimit') setState(id,s=>({...s,stopReason:e.reason}));
        if (e.type === 'delta') update(t => ({ ...t, messages: t.messages.map(m => m.id === control.assistant ? { ...m, text: m.text + e.text } : m) }), id);
        if (e.type === 'artifact') update(t => ({ ...t, artifacts: [...t.artifacts.filter(a => a.id !== e.artifact.id), e.artifact] }), id);
        if (e.type === 'progress') setState(id, s => ({ ...s, progress: e }));
        if (e.type === 'approval' || e.type === 'input') setState(id, s => ({...s,...pendingState([...(s.pending || []).filter(p=>p.id!==e.id),e])}));
        if (e.type === 'requestResolved') setState(id,s=>s.pending?.some(p=>p.id===e.id)?({...s,...pendingState(s.pending.filter(p=>p.id!==e.id))}):s);
        if (e.type === 'waiting') { setState(id, s => ({ ...s, status: 'waiting', questions: e.questions })); if(control.goalMode)setDrafts(all=>({...all,[id]:{...all[id],input:all[id]?.input || '',goalMode:all[id]?.goalMode===undefined?control.goalMode:all[id].goalMode}})); }
        if (e.type === 'failed') setState(id, s => ({ ...s, status: 'failed', error: e.message, resumable: e.resumable }));
        if (e.type === 'complete' || e.type === 'cancelled') setState(id, s => ({ ...s, status: e.type === 'complete' ? 'complete' : 'cancelled', pending:[], approval: undefined, inputRequest: undefined }));
      }
    } catch (e) { if ((e as Error).name !== 'AbortError') setState(id, s => ({ ...s, status: control.runId ? 'disconnected' : 'failed', error: control.runId ? (e as Error).message : `提交尚未确认，原文和引用已保留。${(e as Error).message}`, resumable: !!control.runId })); }
    finally { if (controls.current.get(id) === control) controls.current.delete(id); if (!isDemo) try { const task = await adapter.getTask(id); if (generations.current.get(id) === control.generation && !controls.current.has(id)) setTasks(all => {
        const previous = all.find(t=>t.id===id);
        const pending = previous?.messages.find(m=>m.role==='assistant'&&m.runId===control.runId);
        const keepPending = pending && ['queued','running','waiting'].includes(task.lastRun?.status || '') && !task.messages.some(m=>m.role==='assistant'&&m.runId===control.runId);
        return [{...task,messages:keepPending?[...task.messages,pending]:task.messages},...all.filter(t=>t.id!==id)];
      }); } catch (e) { onError((e as Error).message); } }
  }
  async function send(model?: string, reasoning?: string) {
    const original = (drafts[active]?.input || '').trim();
    // Old drafts may contain retired budget controls. Only the native objective is sent.
    const draftGoal = drafts[active]?.goalMode;
    const goalMode: GoalMode | null = draftGoal ? { objective: draftGoal.objective.trim() || original, origin: 'user' } : null;
    if(goalMode && goalMode.objective.length>3500) return onError('目标最多 3500 字，请简要描述交付物和完成条件。');
    if (!original || busyState(states[active]) || creating || controls.current.has(active)) return;

    if (active && !current.id) return onError('会话正在读取，请稍后发送。');
    const t = active ? current : await create(current.intent); if (!t) return;
    const refs = current.refs; const intent = current.intent;
    const control = { abort: new AbortController(), runId: '', assistant: crypto.randomUUID(), cancel: false, sourceId: active, goalMode, generation: (generations.current.get(t.id) || 0) + 1 }; generations.current.set(t.id, control.generation); controls.current.set(t.id, control);
    setDrafts(all => ({ ...all, [t.id]: { input: original, refs, intent, goalMode } })); setState(t.id, () => ({ status: 'running' }));
    update(task => ({ ...task, intent, refs, title: task.messages.length ? task.title : original.slice(0, 32), messages: [...task.messages, { id: crypto.randomUUID(), role: 'user', text: original }, { id: control.assistant, role: 'assistant', text: '' }] }), t.id);
    await consume(adapter.run({ taskId: t.id, original, intent, refs, model, reasoning, goalMode }, control.abort.signal), t.id, control);
  }
  async function resume() {
    const id = current.id; const last = current.lastRun; if (!id || !last || controls.current.has(id)) return;
    const control = { abort: new AbortController(), runId: last.id, assistant: crypto.randomUUID(), cancel: false, sourceId: null, goalMode:last.goalMode, generation: (generations.current.get(id) || 0) + 1 }; generations.current.set(id, control.generation); controls.current.set(id, control);
    // SSE replays this run from its beginning, into a temporary turn; final GET replaces it with canonical messages.
    update(t => ({ ...t, messages: [...t.messages.filter((m, i) => !(i === t.messages.length - 1 && m.role === 'assistant')), { id: control.assistant, role: 'assistant', text: '', runId:last.id, parts:t.messages.find(m=>m.role==='assistant'&&m.runId===last.id)?.parts }] }), id);
    setState(id, s => ({ status: 'running', activities:s.activities })); await consume(adapter.resume(last.id, control.abort.signal), id, control);
  }
  async function cancel() { const c = controls.current.get(active); if (!c) return; if (!c.runId) { c.cancel = true; return; } try { await adapter.cancel(c.runId); c.abort.abort(); setState(active, s => ({...s, status:'cancelled', pending:[], approval:undefined, inputRequest:undefined})); } catch (e) { onError(`取消尚未确认：${(e as Error).message}`); } }
  async function approval(approved: boolean) { const s = states[active]; const c = controls.current.get(active); if (!s?.approval || !c) return; try { await adapter.resolveApproval(c.runId, s.approval.id, approved); setState(active, current => ({...current,...pendingState((current.pending || []).filter(p=>p.id!==s.approval!.id))})); } catch (e) { onError((e as Error).message); } }
  async function answerInput(answers: Record<string, { answers: string[] }>) { const s = states[active]; if (!s?.inputRequest || !adapter.answerInput) return; try { await adapter.answerInput(s.inputRequest.id, answers); setState(active, current => ({...current,...pendingState((current.pending || []).filter(p=>p.id!==s.inputRequest!.id))})); } catch (e) { onError((e as Error).message); } }
  function setRefs(refs: ResourceRef[]) { if (busyState(states[active])) return; setDrafts(all => ({ ...all, [active]: { ...all[active], input: all[active]?.input || '', refs } })); }
  function setIntent(intent: Intent) { if (busyState(states[active])) return; setDrafts(all => ({ ...all, [active]: { ...all[active], input: all[active]?.input || '', intent } })); }
  function addRef(ref: ResourceRef) { if (busyState(states[active])) return onError('本次执行引用已固定；结束后可添加。'); setRefs(current.refs.some(r => r.snapshotId === ref.snapshotId) ? current.refs : [...current.refs, ref]); }
  return { tasks, active, task: current, creating, create, select, navigate, update, addRef, setRefs, setIntent, send, resume, cancel, approval, answerInput, run: states[active] || { status: 'idle' } as RunState, goalMode: drafts[active]?.goalMode, setGoalMode: (goalMode: GoalMode | null) => setDrafts(all=>({...all,[active]:{...all[active],input:all[active]?.input || '',goalMode}})), input: drafts[active]?.input || '', setInput: (value: string) => setDrafts(all => ({ ...all, [active]: { ...all[active], input: value } })) };
}

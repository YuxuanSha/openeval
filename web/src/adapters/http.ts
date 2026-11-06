import type { EvalAdapter, Capabilities, Resource, Memory, ImportInput, RunRequest, RunEvent, ResourceRef, Task, TaskContract, Artifact, ResourceKind, Intent, Showcase, RecordPage, RunActivity, GoalState, RunRecord } from '../contract';
import type * as Backend from '@openeval/contracts';

type TaskDetail = { task: Backend.Task; messages: (Backend.Message & { parts?: import('../contract').MessagePart[] })[]; runs: Backend.Run[]; contracts: Backend.TaskContract[]; artifacts: Backend.Artifact[]; pendingRequests: PendingRequest[] };
type PendingRequest = { id: string; kind: 'input' | 'approval'; method: string; params: Record<string, unknown> };
type Submission = { run: Backend.Run; contract: Backend.TaskContract };
const toKind = (kind: ResourceKind): Backend.ResourceKind => kind === 'artifactBatch' ? 'artifact_batch' : kind === 'scoringBatch' ? 'scoring_batch' : kind;
const fromKind = (kind: Backend.ResourceKind): ResourceKind => kind === 'artifact_batch' ? 'artifactBatch' : kind === 'scoring_batch' ? 'scoringBatch' : kind;
const fromIntent = (intent: Backend.Intent): Intent => intent;
const actions: Record<string, string> = { read: '读取选定材料', analyze_existing: '分析已有评分', write_report: '编写报告', draft_standard: '共建标准草案', build_dataset: '构建评测集', evaluate_existing: '评测现有产物', clarify: '澄清关键缺口', write_artifact: '生成任务产物' };

/** Presentation mapping only. Canonical domain types are supplied by @openeval/contracts. */
export class HttpAdapter implements EvalAdapter {
  async exportShare(projectId: string, versionIds: string[], artifactIds: string[]) { return this.request('/shares/export', { projectId, versionIds, artifactIds }); }
  async inspectShare(pkg: unknown) { return this.request<import('../contract').SharePreview>('/shares/inspect', { package: pkg }); }
  async importShare(projectId: string, pkg: unknown) { return this.request<{ imported: number }>('/shares/import', { projectId, package: pkg }); }
  private taskIds = new Map<string, string>();
  private runs = new Map<string, string>();
  private versions = new Map<string, Backend.ResourceVersion>();
  private memories = new Map<string, Backend.Memory>();
  private pendingSubmissions = new Map<string, string>();
  constructor(private base = '/api', private projectId = 'default') { try { this.pendingSubmissions = new Map(JSON.parse(localStorage.getItem(this.pendingKey()) || '[]')); } catch { /* Browser storage is optional. */ } }
  private pendingKey() { return `openeval-pending-v2:${this.base}:${this.projectId}`; }
  private pending(key: string, value?: string) { if (value) this.pendingSubmissions.set(key, value); else this.pendingSubmissions.delete(key); try { localStorage.setItem(this.pendingKey(), JSON.stringify([...this.pendingSubmissions])); } catch { /* In-memory idempotency still applies. */ } }
  async listShowcases(): Promise<Showcase[]> { const data = await this.request<{ cases: Showcase[] }>('/showcase'); return data.cases; }
  private async request<T>(path: string, body?: unknown, method?: string): Promise<T> {
    const response = await fetch(this.base + path, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      const raw = await response.text(); let message = raw;
      try { const data = JSON.parse(raw); message = data.error?.message || raw; } catch { /* Preserve plain HTTP error. */ }
      throw new Error(`请求失败 (${response.status})：${message}`);
    }
    return response.status === 204 ? undefined as T : response.json();
  }
  async capabilities(refresh = false): Promise<Capabilities> {
    const runtime = await this.request<{ available: boolean; authenticated: boolean; models: Backend.RuntimeModel[]; error?: string; goals?: Capabilities['goals'] }>(refresh ? '/runtime?refresh=true' : '/runtime');
    const defaultModel = runtime.models.find(m => m.isDefault) || runtime.models[0];
    return { engine: 'codex-cli', mode: 'live', goals: runtime.goals, connected: runtime.available && runtime.authenticated, models: runtime.models.map(m => ({ id: m.id, label: m.label, reasoning: m.efforts })), defaultModel: defaultModel?.id, defaultReasoning: defaultModel?.defaultEffort || undefined, diagnostic: runtime.error || (!runtime.authenticated ? 'Codex 尚未通过 ChatGPT 登录。' : undefined) };
  }
  private resource(versions: Backend.ResourceVersion[]): Resource {
    const latest = versions.at(-1)!;
    const skillDescription = latest.kind === 'skill' ? latest.text.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1] : undefined;
    versions.forEach(v => this.versions.set(v.id, v));
    return { id: latest.resourceId, kind: fromKind(latest.kind), name: latest.title, description: skillDescription || (latest.metadata.extracted === false ? '原始文件已保留，文字尚未提取。' : `${versions.length} 个不可变快照 · 来源与原始口径保留`), provenance: 'backend', snapshots: versions.map(v => ({ id: v.id, label: v.versionLabel || `版本 ${v.version}`, hash: v.hash, createdAt: v.createdAt, content: v.text, note: v.metadata.extracted === false ? '原始文件已保留；需读取原件，不以空文本作判断。' : `版本 ${v.version} · ${v.byteSize} 字节`, source: { type: v.source.type === 'url' ? 'link' : v.source.type === 'builtin' ? 'builtin' : v.source.type === 'historical' ? 'historical' : 'file', name: v.source.name || v.title, url: v.source.url, retrievedAt: v.source.retrievedAt }, metadata: v.metadata, originalDownloadUrl: `${this.base}/versions/${encodeURIComponent(v.id)}/download` })) };
  }
  async listResources(projectId=this.projectId): Promise<Resource[]> {
    const { resources } = await this.request<{ resources: Backend.ResourceVersion[] }>(`/resources?projectId=${encodeURIComponent(projectId)}`);
    return Promise.all(resources.map(async r => {
      const { versions } = await this.request<{ versions: Backend.ResourceVersion[] }>(`/resources/${encodeURIComponent(r.resourceId)}/versions`);
      const full = await Promise.all(versions.map(v => this.request<Backend.ResourceVersion>(`/versions/${encodeURIComponent(v.id)}`)));
      return this.resource(full);
    }));
  }
  async listRecords(versionId: string, offset = 0, limit = 30): Promise<RecordPage> { return this.request(`/versions/${encodeURIComponent(versionId)}/records?offset=${offset}&limit=${limit}`); }
  async importResource(input: ImportInput): Promise<Resource> {
    let version: Backend.ResourceVersion;
    if (input.source.type === 'link') {
      version = await this.request(input.resourceId ? `/resources/${encodeURIComponent(input.resourceId)}/import-link` : '/resources/import-link', { projectId: input.projectId??this.projectId, kind: toKind(input.kind), title: input.name, url: input.source.url, versionLabel: input.label });
    } else {
      version = await this.request(input.resourceId ? `/resources/${encodeURIComponent(input.resourceId)}/versions` : '/resources', { projectId: input.projectId??this.projectId, kind: toKind(input.kind), title: input.name, versionLabel: input.label, ...(input.file ? { contentBase64: input.file.contentBase64, fileName: input.file.name, mime: input.file.mime } : { text: input.content, fileName: input.source.name === '粘贴文本' ? `${input.name}.${['dataset','artifactBatch','scoringBatch'].includes(input.kind)?'txt':'md'}` : input.source.name, mime: 'text/plain' }) });
    }
    const { versions } = await this.request<{ versions: Backend.ResourceVersion[] }>(`/resources/${encodeURIComponent(version.resourceId)}/versions`);
    return this.resource(await Promise.all(versions.map(v => this.request<Backend.ResourceVersion>(`/versions/${encodeURIComponent(v.id)}`))));
  }
  private memory(m: Backend.Memory): Memory {
    this.memories.set(m.id, m);
    const heading = m.content.match(/^# ([^\n]+)\n\n/);
    return { id: m.id, projectId:m.projectId??undefined, title: heading?.[1] || m.content.split('\n')[0].slice(0, 32), content: heading ? m.content.slice(heading[0].length) : m.content, source: m.source, scope: m.scope === 'user' ? 'personal' : 'project', updatedAt: m.updatedAt };
  }
  async listMemories(projectId=this.projectId): Promise<Memory[]> { const { memories } = await this.request<{ memories: Backend.Memory[] }>(`/memories?projectId=${encodeURIComponent(projectId)}`); return memories.map(m => this.memory(m)); }
  async saveMemory(memory: Memory): Promise<Memory> {
    const existing = this.memories.get(memory.id);
    if (existing && existing.scope !== (memory.scope === 'personal' ? 'user' : 'project')) throw new Error('已有记忆的适用范围由后端固定。请新建目标范围的记忆后撤回旧记录，避免悄悄改变注入范围。');
    const content = `# ${memory.title}\n\n${memory.content}`;
    const result = await this.request<Backend.Memory>(existing ? `/memories/${encodeURIComponent(memory.id)}` : '/memories', { projectId: memory.projectId??this.projectId, scope: memory.scope === 'personal' ? 'user' : 'project', content, source: memory.source }, existing ? 'PATCH' : 'POST');
    return this.memory(result);
  }
  async deleteMemory(id: string): Promise<void> { await this.request(`/memories/${encodeURIComponent(id)}`, undefined, 'DELETE'); }
  private async ref(ref: Backend.ResourceRef): Promise<ResourceRef> {
    let version = this.versions.get(ref.versionId);
    if (!version) { version = await this.request<Backend.ResourceVersion>(`/versions/${encodeURIComponent(ref.versionId)}`); this.versions.set(version.id, version); }
    return { resourceId: version.resourceId, snapshotId: version.id };
  }
  private async contract(c: Backend.TaskContract): Promise<TaskContract> {
    return { original: c.userText, intent: fromIntent(c.intent), objective: c.goal, refs: await Promise.all(c.refs.map(r => this.ref(r))), operations: c.allowedActions.map(a => actions[a] || a), invariants: c.assumptions, outputs: c.deliverables, unresolved: c.openQuestions, compiledPrompt: c.finalPrompt, goalMode: c.goalMode, skills: await Promise.all((c.skillVersionIds || []).map(versionId => this.ref({ versionId }))), changes: [{ field: '允许的操作', original: c.userText, resolved: c.allowedActions.map(a => actions[a] || a).join(' → '), reason: '由后端任务契约显式列出；原文、分母与引用保持不变。' }] };
  }
  private artifact(a: Backend.Artifact): Artifact { const kind = a.kind && ['report','analysis','standard','dataset'].includes(a.kind) ? a.kind as Artifact['kind'] : 'evidence'; return { id: a.id, title: a.title || a.name, sourcePath:a.name, runId:a.runId, kind, resourceKind: a.kind ? fromKind(a.kind) : undefined, version:a.version, registrationStatus:a.registrationStatus, registrationError:a.registrationError, mimeType: a.mime, downloadUrl: `${this.base}/artifacts/${encodeURIComponent(a.id)}/download`, previewUrl: `${this.base}/artifacts/${encodeURIComponent(a.id)}/preview`, demo: false }; }
  async createTask(intent: Intent = 'chat', requestId = crypto.randomUUID(), projectId=this.projectId): Promise<Task> {
    const t = await this.request<Backend.Task>('/tasks', { projectId, title: '新任务', intent, requestId });
    this.taskIds.set(t.id, t.id);
    return { id: t.id, projectId:t.projectId, title: t.title, intent: fromIntent(t.intent), messages: [], refs: [], artifacts: [] };
  }
  private runRecord(r: Backend.Run): RunRecord { return { id:r.id, traceUrl:`${this.base}/runs/${encodeURIComponent(r.id)}/trace`, status:r.status, model:r.model || undefined, reasoning:r.effort || undefined, createdAt:r.createdAt, updatedAt:r.updatedAt, error:r.error || undefined, goalMode:r.goalMode, goalState:r.goalState as unknown as GoalState, turnCount:r.turnCount, stopReason:r.stopReason, validationStatus:r.validationStatus }; }
  async getTask(id: string): Promise<Task> {
    const detail = await this.request<TaskDetail>(`/tasks/${encodeURIComponent(id)}`);
    const t = detail.task; this.taskIds.set(t.id, t.id);
    detail.runs.forEach(r => this.runs.set(r.id, t.id));
    const latest = detail.contracts.at(-1);
    const contract = latest ? await this.contract(latest) : undefined;
    return { id: t.id, projectId:t.projectId, title: t.title, intent: fromIntent(t.intent), messages: await Promise.all(detail.messages.filter(m => m.role !== 'system').map(async m => ({ id: m.id, role: m.role as 'user' | 'assistant', text: m.text, parts: m.parts, refs: await Promise.all(m.refs.map(r => this.ref(r))), runId: m.runId || undefined }))), refs: contract?.refs || [], artifacts: detail.artifacts.map(a => this.artifact(a)), contract, runs: detail.runs.map(r => this.runRecord(r)), lastRun: detail.runs.at(-1) ? this.runRecord(detail.runs.at(-1)!) : undefined };
  }
  async listTasks(projectId=this.projectId): Promise<Task[]> {
    const { tasks } = await this.request<{ tasks: Backend.Task[] }>(`/tasks?projectId=${encodeURIComponent(projectId)}`);
    return Promise.all(tasks.map(t => this.getTask(t.id)));
  }
  async cancel(runId: string): Promise<void> { const run = await this.request<Backend.Run>(`/runs/${encodeURIComponent(runId)}/cancel`, {}); if (run.status !== 'cancelled') throw new Error(`后端当前状态为 ${run.status}；尚未确认停止，继续跟踪事件。`); }
  async resolveApproval(_runId: string, requestId: string, approved: boolean): Promise<void> { await this.request(`/requests/${encodeURIComponent(requestId)}/respond`, { decision: approved ? 'accept' : 'decline' }); }
  async answerInput(requestId: string, answers: Record<string, { answers: string[] }>): Promise<void> { await this.request(`/requests/${encodeURIComponent(requestId)}/respond`, { answers }); }
  async *run(request: RunRequest, signal: AbortSignal): AsyncIterable<RunEvent> {
    let taskId = this.taskIds.get(request.taskId);
    if (!taskId) throw new Error('会话尚未加载或创建，请先打开有效任务后发送。');
    // Retain the idempotency key on an uncertain POST; replaying the SSE never repeats execution.
    const key = `${taskId}:${request.original}:${JSON.stringify(request.refs)}:${request.intent}:${request.model || ''}:${request.reasoning || ''}:${JSON.stringify(request.goalMode || null)}`;
    const requestId = this.pendingSubmissions.get(key) || crypto.randomUUID(); this.pending(key, requestId);
    const refs = request.refs.map(ref => { const version = this.versions.get(ref.snapshotId); if (!version) throw new Error('引用版本尚未加载，请重新打开资料库后选择。'); return { versionId: ref.snapshotId, hash: version.hash }; });
    const result = await this.request<Submission>(`/tasks/${encodeURIComponent(taskId)}/messages`, { text: request.original, intent: request.intent, refs, model: request.model, effort: request.reasoning, goalMode: request.goalMode, requestId });
    this.pending(key); this.runs.set(result.run.id, taskId);
    yield { type: 'started', runId: result.run.id, taskId, model: result.run.model || undefined, reasoning: result.run.effort || undefined, createdAt: result.run.createdAt };
    yield { type: 'contract', contract: await this.contract(result.contract) };
    if (result.contract.openQuestions.length) { yield { type: 'waiting', questions: result.contract.openQuestions }; return; }
    yield* this.events(taskId, result.run.id, signal);
  }
  async *activity(runId: string, signal: AbortSignal): ReturnType<EvalAdapter['activity']> {
    const taskId = this.runs.get(runId); if (!taskId) throw new Error('运行记录未加载');
    const detail = await this.request<TaskDetail>(`/tasks/${encodeURIComponent(taskId)}`);
    const run = detail.runs.find(r=>r.id===runId); if(!run) throw new Error('运行记录不存在');
    if(run.status==='waiting' && detail.contracts.find(c=>c.id===run.contractId)?.openQuestions.length) return;
    if(signal.aborted) return;
    for await (const e of this.events(taskId, runId, signal)) {
      if(signal.aborted) return;
      if(e.type==='activity' || e.type==='warning') yield e;
      if(e.type==='complete' || e.type==='cancelled') yield {type:'status', status:e.type==='complete'?'completed':'cancelled'};
      if(e.type==='failed') { yield {type:'warning', message:e.message}; yield {type:'status', status:'failed'}; }
      if(e.type==='disconnected') throw new Error(e.message);
    }
  }
  async *resume(runId: string, signal: AbortSignal): AsyncIterable<RunEvent> {
    const taskId = this.runs.get(runId); if (!taskId) throw new Error('运行记录未加载，请刷新任务列表。');
    const replayAt = Date.now(); const detail = await this.request<TaskDetail>(`/tasks/${encodeURIComponent(taskId)}`); const prior = detail.runs.find(r => r.id === runId);
    const priorContract = detail.contracts.find(c => c.id === prior?.contractId);
    if (prior?.status === 'waiting' && priorContract?.openQuestions.length) { yield { type: 'contract', contract: await this.contract(priorContract) }; yield { type: 'waiting', questions: priorContract.openQuestions }; return; }
    if (prior && ['queued', 'running', 'waiting'].includes(prior.status)) { yield { type: 'started', runId, taskId, model: prior.model || undefined, reasoning: prior.effort || undefined, createdAt: prior.createdAt }; yield* this.events(taskId, runId, signal, { at: replayAt, pending: new Set(detail.pendingRequests.map(r => r.id)) }); return; }
    if (prior?.status === 'completed') { yield { type: 'complete' }; return; }
    if (prior?.status === 'cancelled') { yield { type: 'cancelled' }; return; }
    const key = `retry:${runId}`; const requestId = this.pendingSubmissions.get(key) || crypto.randomUUID(); this.pending(key, requestId);
    const result = await this.request<Submission>(`/runs/${encodeURIComponent(runId)}/retry`, { requestId, ...(prior?.goalMode ? { goalMode: { objective: prior.goalMode.objective, origin: 'user' } } : {}) }); this.pending(key);
    this.runs.set(result.run.id, taskId); yield { type: 'started', runId: result.run.id, taskId, model: result.run.model || undefined, reasoning: result.run.effort || undefined, createdAt: result.run.createdAt }; yield { type: 'contract', contract: await this.contract(result.contract) };
    if (result.contract.openQuestions.length) { yield { type: 'waiting', questions: result.contract.openQuestions }; return; }
    yield* this.events(taskId, result.run.id, signal);
  }
  private async *events(taskId: string, runId: string, signal: AbortSignal, replay?: { at: number; pending: Set<string> }): AsyncIterable<RunEvent> {
    let after = 0; const artifacts = new Set<string>(); let hasDelta = false; let attempts = 0;
    const activities = new Map<string, RunActivity>();
    const messageParts = new Map<string, import('../contract').MessagePart>();
    while (!signal.aborted && attempts < 3) {
      const streamControl = new AbortController(); const abort = () => streamControl.abort(); signal.addEventListener('abort', abort, { once: true });
      let heartbeat: ReturnType<typeof setTimeout> | undefined;
      const armHeartbeat = () => { clearTimeout(heartbeat); heartbeat = setTimeout(() => streamControl.abort(new Error('事件连接超过 45 秒未收到心跳')), 45000); };
      try {
        armHeartbeat();
        const response = await fetch(`${this.base}/tasks/${encodeURIComponent(taskId)}/events?after=${after}`, { headers: { Accept: 'text/event-stream' }, signal: streamControl.signal });
        if (!response.ok || !response.body) throw new Error(`事件连接失败 (${response.status})`);
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        try {
          while (true) {
            const { value, done } = await reader.read(); armHeartbeat(); buffer += decoder.decode(value, { stream: !done });
            let end;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
              const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
              if (!data) continue;
              if (signal.aborted) return;
              const e = JSON.parse(data) as Backend.RunEvent; if (e.id <= after) continue; after = e.id;
              if (e.runId !== runId) continue;
              if (e.kind === 'tool.started' || e.kind === 'tool.completed') {
                const item = e.data.item as Record<string, unknown> | undefined;
                if (item?.type === 'agentMessage') {
                  const id = String(item.id || e.data.itemId || 'legacy');
                  const previous = messageParts.get(id);
                  const part = { id, text: typeof item.text === 'string' && item.text ? item.text : previous?.text || '', phase: typeof item.phase === 'string' ? item.phase : previous?.phase, at: previous?.at || e.createdAt };
                  messageParts.set(id, part); yield {type:'messagePart', part};
                  if (part.text) yield {type:'activity', activity:{id:`message:${id}`,kind:'message',phase:part.phase,title:part.phase==='final_answer'?'回答':'过程说明',detail:part.text,state:e.kind==='tool.started'?'running':'complete',at:part.at}};
                }
                if (item && !['reasoning', 'agentMessage', 'userMessage'].includes(String(item.type))) {
                  const type = String(item.type || 'tool'); const command = item.command;
                  const files = item.changes as { path?: string; kind?: string; diff?: string }[] | undefined;
                  const title = type === 'commandExecution' ? String(command || '命令执行') : type === 'fileChange' ? `文件变更 · ${files?.map(f => f.path).join('、') || '任务文件'}` : String(item.tool || item.name || type);
                  const detail = type === 'commandExecution' ? String(item.aggregatedOutput || '') : type === 'fileChange' ? files?.map(f => `${f.kind || ''} ${f.path || ''}\n${f.diff || ''}`).join('\n\n') : item.result ? JSON.stringify(item.result, null, 2) : undefined;
                  const activity: RunActivity = { id: String(item.id || e.id), kind: type === 'commandExecution' ? 'command' : type === 'fileChange' ? 'file' : 'tool', title, state: item.status === 'declined' ? 'declined' : item.status === 'failed' || (typeof item.exitCode === 'number' && item.exitCode !== 0) ? 'failed' : e.kind === 'tool.started' ? 'running' : 'complete', detail: detail || activities.get(String(item.id || e.id))?.detail, at: activities.get(String(item.id || e.id))?.at || e.createdAt };
                  activities.set(activity.id, activity); yield {type:'activity', activity};
                }
              }
              if (e.kind === 'progress' && e.data.protocolMethod === 'item/commandExecution/outputDelta') {
                const id = String(e.data.itemId); const previous = activities.get(id);
                const activity: RunActivity = { id, kind:'command', title:previous?.title || '命令输出', state:previous?.state || 'running', detail:(previous?.detail || '') + String(e.data.text || ''), at:previous?.at || e.createdAt };
                activities.set(id, activity); yield {type:'activity', activity};
              }
              if (e.kind === 'approval.requested' || e.kind === 'input.requested') {
                const r = e.data as unknown as PendingRequest; const approval = e.kind === 'approval.requested';
                const activity: RunActivity = {id:`request:${r.id}`,kind:approval?'approval':'input',title:approval?'权限请求':'补充信息',state:'pending',detail:JSON.stringify(r.params,null,2),at:e.createdAt};
                activities.set(activity.id,activity); yield {type:'activity',activity};
              }
              if (e.kind === 'request.resolved') {
                if(typeof e.data.id==='string') yield {type:'requestResolved',id:e.data.id};
                const previous = activities.get(`request:${e.data.id}`); const response = e.data.response as {decision?:string} | undefined;
                if(previous) { const activity:RunActivity = {...previous,state:response?.decision==='decline'?'declined':'complete',detail:`${previous.detail || ''}\n\n响应：${JSON.stringify(e.data.response || e.data,null,2)}`}; activities.set(activity.id,activity); yield {type:'activity',activity}; }
                else yield {type:'activity',activity:{id:`resolved:${e.id}`,kind:'status',title:'请求已响应',state:'complete',detail:JSON.stringify(e.data,null,2),at:e.createdAt}};
              }
              if (e.kind === 'error') yield {type:'activity',activity:{id:`warning:${e.id}`,kind:'status',title:'执行提示',state:'failed',detail:String(e.data.message || ''),at:e.createdAt}};
              if (e.kind === 'progress') { const plan = e.data.plan as {step: string; status: string}[] | undefined; if (plan) yield { type: 'activity', activity: { id: `plan:${runId}`, kind: 'phase', title: `执行计划 · ${plan.length} 项`, state: plan.length>0 && plan.every(s=>s.status==='completed') ? 'complete' : plan.some(s=>['inProgress','in_progress'].includes(s.status)) ? 'running' : 'pending', detail: plan.map(s=>`${s.status==='completed'?'已完成':['inProgress','in_progress'].includes(s.status)?'执行中':'待执行'} · ${s.step}`).join('\n'), at: e.createdAt } }; }
              if (e.kind === 'goal.updated') yield { type:'goal', goal:e.data.goal as GoalState | null };
              if (e.kind === 'goal.limit') yield { type:'goalLimit', reason:String(e.data.reason || '目标已停止') };
              if (e.kind === 'turn.started' || e.kind === 'turn.completed') yield { type:'turn', count:typeof e.data.turnCount==='number'?e.data.turnCount:undefined, status:e.kind==='turn.started'?'running':'completed', turnId:String(e.data.turnId || '') };
              if (e.kind === 'run.status' && e.data.status === 'waiting') {
                // The backend also emits waiting BEFORE approval/input requests. Only a
                // confirmed blocked goal with no pending request is a terminal wait.
                const detail = await this.request<TaskDetail>(`/tasks/${encodeURIComponent(taskId)}`);
                const current = detail.runs.find(r=>r.id===runId);
                if(current?.status==='waiting' && current.goalState?.status==='blocked' && !detail.pendingRequests.some(r=>(r as PendingRequest & {runId?:string}).runId===runId || !(r as PendingRequest & {runId?:string}).runId)) { yield {type:'waiting', questions:['目标在等待条件满足，请补充任务说明后继续。']}; return; }
              }
              if (e.kind === 'error') yield { type: 'warning', message: String(e.data.message || '执行遇到需要留意的问题') };
              else if (e.kind === 'contract' && e.data.contract) yield { type: 'contract', contract: await this.contract(e.data.contract as unknown as Backend.TaskContract) };
              else if (e.kind === 'assistant.delta') {
                hasDelta = true; const id = String(e.data.itemId || 'legacy'); const text = String(e.data.text || '');
                const previous = messageParts.get(id); const part = {id, text:(previous?.text || '') + text, phase:previous?.phase, at:previous?.at || e.createdAt};
                messageParts.set(id,part); yield {type:'delta',text,itemId:id}; yield {type:'messagePart',part};
                yield {type:'activity',activity:{id:`message:${id}`,kind:'message',phase:part.phase,title:part.phase==='final_answer'?'回答':'过程说明',detail:part.text,state:'running',at:part.at}};
              }
              else if (e.kind === 'message' && e.data.role === 'assistant' && !hasDelta) yield { type: 'delta', text: String(e.data.text || '') };
              else if (e.kind === 'artifact') { const a = e.data as unknown as Backend.Artifact; if (!artifacts.has(a.id)) { artifacts.add(a.id); yield { type: 'artifact', artifact: this.artifact(a) }; } }
              else if (e.kind === 'approval.requested') {
                const r = e.data as unknown as PendingRequest; if (replay && Date.parse(e.createdAt) <= replay.at && !replay.pending.has(r.id)) continue; yield { type: 'approval', id: r.id, action: String(r.params.command || r.params.reason || r.method), reason: String(r.params.reason || '来自 Codex CLI 的本次权限请求。') };
              } else if (e.kind === 'input.requested') {
                const r = e.data as unknown as PendingRequest; if (replay && Date.parse(e.createdAt) <= replay.at && !replay.pending.has(r.id)) continue; const q = (r.params.questions || []) as { id: string; question: string; options?: { label: string }[] }[];
                yield { type: 'input', id: r.id, questions: q.map(x => ({ id: x.id, question: x.question, options: x.options?.map(o => o.label) })) };
              } else if ((e.kind === 'progress' && e.data.protocolMethod !== 'item/commandExecution/outputDelta') || e.kind === 'tool.started' || e.kind === 'tool.completed') {
                const plan = e.data.plan as { step: string; status: string }[] | undefined;
                yield { type: 'progress', step: plan?.filter(p => p.status === 'completed').length || 0, total: plan?.length || 0, label: plan?.find(p => p.status === 'inProgress' || p.status === 'in_progress')?.step || String(e.data.message || e.data.text || (e.kind === 'tool.started' ? 'Codex 正在处理工具操作' : e.kind === 'tool.completed' ? '工具操作返回，继续处理' : 'Codex 正在执行')).slice(0, 180) };
              } else if (e.kind === 'run.status' && ['queued', 'running'].includes(String(e.data.status))) { yield { type: 'running' };
              } else if (e.kind === 'run.status' && ['completed', 'failed', 'interrupted', 'cancelled'].includes(String(e.data.status))) {
                // Backend records artifacts in its finalization after the terminal status event.
                try {
                  const detail = await this.request<TaskDetail>(`/tasks/${encodeURIComponent(taskId)}`);
                  for (const a of detail.artifacts.filter(a => a.runId === runId)) if (!artifacts.has(a.id)) { artifacts.add(a.id); yield { type: 'artifact', artifact: this.artifact(a) }; }
                } catch { yield { type: 'warning', message: '执行状态已确认，但产物列表读取失败。重新打开任务可再次获取。' }; }
                if (e.data.status === 'completed') yield { type: 'complete' };
                else if (e.data.status === 'cancelled') yield { type: 'cancelled' };
                else yield { type: 'failed', message: String(e.data.error || '执行已中断，记录与引用保留。'), resumable: true };
                return;
              }
            }
            if (done) break;
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        attempts++;
      } catch (error) { if (signal.aborted) throw error; attempts++; if (attempts >= 3) throw error; }
      finally { clearTimeout(heartbeat); signal.removeEventListener('abort', abort); streamControl.abort(); }
      yield { type: 'progress', step: 0, total: 0, label: '正在恢复事件连接；只重放新事件，不重复执行任务。' };
    }
    if (!signal.aborted) yield { type: 'disconnected', message: '事件连接中断，请恢复连接以核对实际运行状态。' };
  }
}

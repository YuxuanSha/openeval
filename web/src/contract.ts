import type { GoalMode } from '@openeval/contracts';
import type { MessagePart } from '@openeval/contracts';
export type { MessagePart } from '@openeval/contracts';
export type { GoalMode } from '@openeval/contracts';
/** Transport-independent boundary. Backend remains the authority for execution and intent. */
export type ResourceKind = 'standard' | 'dataset' | 'artifactBatch' | 'scoringBatch' | 'analysis' | 'report' | 'template' | 'reference' | 'skill';
export type Intent = 'standard' | 'dataset' | 'evaluate' | 'analyze' | 'report' | 'chat';
export type SampleStatus = 'scored' | 'insufficient_evidence' | 'not_delivered' | 'execution_failed' | 'not_applicable' | 'pending';
export interface Snapshot {
  id: string; label: string; hash: string; createdAt: string; note: string; content: string;
  source: { type: 'file' | 'link' | 'builtin' | 'historical'; name: string; url?: string; retrievedAt?: string };
  originalDownloadUrl?: string; metadata?: Record<string, unknown>;
}
export interface Resource {
  id: string; kind: ResourceKind; name: string; description: string; snapshots: Snapshot[];
  provenance: 'historical_demo' | 'user_local' | 'backend'; tags?: string[];
}
export interface ResourceRef { resourceId: string; snapshotId: string }
export interface Memory {
  id: string; title: string; content: string; source: string; projectId?: string;
  scope: 'project' | 'personal'; updatedAt: string;
}
export interface Capabilities {
  engine: 'codex-cli'; connected: boolean; mode: 'demo' | 'live';
  models: { id: string; label: string; reasoning: string[] }[];
  defaultModel?: string; defaultReasoning?: string;
  diagnostic?: string; goals?: { supported: boolean; enabled: boolean; stage?: string };
}
export interface TaskContract {
  original: string; intent: Intent; objective: string; refs: ResourceRef[];
  operations: string[]; invariants: string[]; outputs: string[];
  changes: { field: string; original: string; resolved: string; reason: string }[];
  unresolved: string[];
  compiledPrompt?: string; goalMode?: GoalMode | null;
  skills?: ResourceRef[];
}
export interface RunRequest {
  taskId: string; original: string; intent: Intent; refs: ResourceRef[];
  model?: string; reasoning?: string; goalMode?: GoalMode | null; template?: ResourceRef;
  /** Demo-only scenario control; never forward as a live scoring instruction. */
  demoScenario?: 'normal' | 'failure' | 'approval';
}
export interface Artifact {
  id: string; title: string; sourcePath?: string; runId?: string; kind: 'plan' | 'report' | 'evidence' | 'standard' | 'dataset' | 'analysis';
  mimeType: string; content?: string; downloadUrl?: string; previewUrl?: string; demo: boolean; resourceKind?: ResourceKind; version?: number; registrationStatus?: 'registered' | 'unregistered' | 'failed'; registrationError?: string | null;
}
export interface RunActivity { id: string; phase?: string; kind: 'command' | 'file' | 'tool' | 'phase' | 'message' | 'approval' | 'input' | 'status'; title: string; state: 'pending' | 'running' | 'complete' | 'failed' | 'declined'; detail?: string; at: string }
export type RunEvent =
  | { type: 'started'; runId: string; taskId: string; model?: string; reasoning?: string; createdAt?: string }
  | { type: 'running' }
  | { type: 'disconnected'; message: string }
  | { type: 'goal'; goal: GoalState | null }
  | { type: 'turn'; count?: number; status: 'running' | 'completed'; turnId?: string }
  | { type: 'goalLimit'; reason: string }
  | { type: 'activity'; activity: RunActivity }
  | { type: 'warning'; message: string }
  | { type: 'contract'; contract: TaskContract }
  | { type: 'delta'; text: string; itemId?: string }
  | { type: 'messagePart'; part: MessagePart }
  | { type: 'requestResolved'; id: string }
  | { type: 'progress'; step: number; total: number; label: string }
  | { type: 'approval'; id: string; action: string; reason: string }
  | { type: 'input'; id: string; questions: { id: string; question: string; options?: string[] }[] }
  | { type: 'waiting'; questions: string[] }
  | { type: 'artifact'; artifact: Artifact }
  | { type: 'failed'; message: string; resumable: boolean }
  | { type: 'complete' }
  | { type: 'cancelled' };
export interface ImportInput { projectId?: string; name: string; kind: ResourceKind; label: string; content: string; source: Snapshot['source']; resourceId?: string; file?: { contentBase64: string; name: string; mime: string } }
export interface SourceRecord { recordId: string; sourceRow: number; identity: unknown; identityStatus: string; raw: Record<string, unknown> }
export interface RecordPage { records: SourceRecord[]; total: number; offset: number; limit: number }
export interface EvalAdapter {
  exportShare(projectId: string, versionIds: string[], artifactIds: string[]): Promise<unknown>;
  inspectShare(pkg: unknown): Promise<SharePreview>;
  importShare(projectId: string, pkg: unknown): Promise<{ imported: number }>;
  capabilities(refresh?: boolean): Promise<Capabilities>;
  listTasks(projectId?: string): Promise<Task[]>;
  createTask(intent?: Intent, requestId?: string, projectId?: string): Promise<Task>;
  getTask(id: string): Promise<Task>;
  listShowcases(): Promise<Showcase[]>;
  listResources(projectId?: string): Promise<Resource[]>;
  listRecords(versionId: string, offset?: number, limit?: number): Promise<RecordPage>;
  importResource(input: ImportInput): Promise<Resource>;
  listMemories(projectId?: string): Promise<Memory[]>;
  saveMemory(memory: Memory): Promise<Memory>;
  deleteMemory(id: string): Promise<void>;
  run(request: RunRequest, signal: AbortSignal): AsyncIterable<RunEvent>;
  activity(runId: string, signal: AbortSignal): AsyncIterable<{ type: 'activity'; activity: RunActivity } | { type: 'status'; status: string } | { type: 'warning'; message: string }>;
  resume(runId: string, signal: AbortSignal): AsyncIterable<RunEvent>;
  cancel(runId: string): Promise<void>;
  resolveApproval(runId: string, approvalId: string, approved: boolean): Promise<void>;
  answerInput?(requestId: string, answers: Record<string, { answers: string[] }>): Promise<void>;
}
export interface SharePreview { entries: { key: string; title: string; path: string; kind: string; version: number; byteSize: number }[]; totalBytes: number; manifestSha256: string; warnings: string[]; credentialRisk: boolean }
export interface Showcase {
  id: string; title: string; user_intent: string; references: string[];
  stages: { id: string; title: string; kind: string; text: string; claim_refs: string[]; artifact_ids: string[] }[];
  limitations: string[]; evidence_state: string; entry_prompt_is: string;
}
export interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; parts?: MessagePart[]; historical?: boolean; refs?: ResourceRef[]; runId?: string }
export interface GoalState { status: string; objective?: string; tokensUsed?: number; tokenBudget?: number; timeUsedSeconds?: number }
export interface RunRecord { id: string; updatedAt?: string; traceUrl?: string; status: string; error?: string; model?: string; reasoning?: string; createdAt: string; goalMode?: GoalMode | null; goalState?: GoalState | null; turnCount?: number; stopReason?: string; validationStatus?: 'not_checked' | 'passed' | 'failed' }
export interface Task { id: string; projectId?: string; title: string; intent: Intent; messages: ChatMessage[]; refs: ResourceRef[]; artifacts: Artifact[]; contract?: TaskContract; lastRun?: RunRecord; runs?: RunRecord[] }
export const kindLabels: Record<ResourceKind, string> = { standard: '评测标准', dataset: '评测集', artifactBatch: '被评产物批次', scoringBatch: '评分批次', analysis: '分析记录', report: '报告', template: '报告模板', reference: '参考资料', skill: 'Skill' };
export const intentLabels: Record<Intent, string> = { chat: '自由对话', standard: '共建标准', dataset: '构建评测集', evaluate: '敏捷评测', analyze: '分析已有结果', report: '撰写报告' };

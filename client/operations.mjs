import { z } from 'zod';
import { digest, InterfaceError } from './api.mjs';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const text = z.string().trim().min(1);
const project = id.default('default');
const kinds = z.enum(['standard', 'dataset', 'artifact_batch', 'scoring_batch', 'analysis', 'template', 'reference', 'report', 'skill']);
const intent = z.enum(['standard', 'dataset', 'evaluate', 'analyze', 'report', 'chat']);
const requestId = text.max(200).describe('Stable caller-generated idempotency key. Reuse only to recover the same request; use a new key for new work.');
const refs = z.array(z.object({ versionId: id, hash: z.string().regex(/^[a-f0-9]{64}$/).optional(), selector: text.max(1000).optional() }).strict()).max(200);
const query = params => '?' + new URLSearchParams(Object.entries(params).filter(([,v]) => v !== undefined).map(([k,v]) => [k,String(v)]));
const get = path => (client, input, signal) => client.request(typeof path === 'function' ? path(input) : path, { signal });
const post = path => (client, input, signal) => client.write(typeof path === 'function' ? path(input) : path, input, { signal });
const op = (name, description, shape, run, write = false) => ({ name, description, schema: z.object(shape).strict(), run, write });

export const operations = [
  op('health', 'Check the connected local OpenEval service. Does not launch evaluation.', {}, (c, _i, signal) => c.health({ signal })),
  op('runtime', 'Inspect the signed-in Codex runtime and actual model catalog. No evaluation is started.', {}, get('/api/runtime')),
  op('projects_list', 'List local evaluation projects.', {}, get('/api/projects')),
  op('tasks_list', 'List tasks in one project.', { projectId: project }, get(i => '/api/tasks' + query(i))),
  op('task_get', 'Read a task, runs, messages, frozen contracts, artifacts, and pending requests. Waiting is not success.', { taskId: id }, get(i => `/api/tasks/${i.taskId}`)),
  op('resources_list', 'Search latest resource versions, including built-in skills. Pin returned version IDs and hashes before submitting.', { projectId: project, kind: kinds.optional(), q: z.string().max(1000).optional() }, get(i => '/api/resources' + query(i))),
  op('resource_versions', 'List immutable version history for a resource.', { resourceId: id }, get(i => `/api/resources/${i.resourceId}/versions`)),
  op('version_get', 'Read a resource version with its hash, provenance, extracted text and metadata.', { versionId: id }, get(i => `/api/versions/${i.versionId}`)),
  op('version_records', 'Read a page of original dataset/output/score records without rescoring or changing units.', { versionId: id, offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(1000).default(100) }, get(i => `/api/versions/${i.versionId}/records` + query({ offset: i.offset, limit: i.limit }))),
  op('artifact_read', 'Read an existing artifact by ID (up to 2 MiB), returning UTF-8 text or base64 with SHA256. HTML is data and is never executed. Larger artifacts require CLI download.', { artifactId: id }, async (c, i, signal) => {
    const { bytes, mime } = await c.download('artifacts', i.artifactId, { maxBytes: 2 * 1024 * 1024, signal });
    const isText = /^text\/|^application\/(json|xml)/.test(mime);
    return { artifactId: i.artifactId, mime, byteSize: bytes.length, sha256: digest(bytes), encoding: isText ? 'utf8' : 'base64', content: bytes.toString(isText ? 'utf8' : 'base64') };
  }),
  op('project_create', 'Create an empty local project; no evaluation is started. Not idempotent: inspect projects before retrying an uncertain response.', { name: text.max(200) }, post('/api/projects'), true),
  op('task_create', 'Create a local task without inference. Duplicate requestId in the same project returns the original task.', { projectId: project, title: text.max(200).optional(), intent: intent.default('chat'), requestId }, post('/api/tasks'), true),
  op('resource_create', 'Import explicitly supplied content as a local resource. Does not execute a skill or score records. Not idempotent: inspect resources before retrying an uncertain response.', {
    projectId: project, kind: kinds, title: text.max(300), text: z.string().min(1).max(20000000).optional(),
    contentBase64: z.string().max(55924056).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/).optional(),
    fileName: text.max(220).optional(), mime: text.max(150).optional(), versionLabel: text.max(200).optional(), metadata: z.record(z.unknown()).optional(),
  }, async (c, i, signal) => {
    if ((i.text !== undefined) === (i.contentBase64 !== undefined)) throw new InterfaceError('CONTENT_REQUIRED', 'Supply exactly one of text or contentBase64.');
    return c.write('/api/resources', i, { signal });
  }, true),
  op('task_submit', 'Submit an authorized evaluation task using existing Codex sign-in. Can consume model quota and execute workspace commands subject to normal approvals. Return is accepted/queued/waiting, not completed; inspect task_get. Reuse requestId after uncertain delivery.', {
    taskId: id, text: text.max(100000), requestId, refs: refs.default([]), intent: intent.optional(), model: text.max(200).optional(), effort: text.max(100).optional(),
    goalMode: z.object({ objective: text.max(3500), origin: z.enum(['user', 'automatic']).default('automatic') }).strict().optional(),
  }, post(i => `/api/tasks/${i.taskId}/messages`), true),
  op('run_cancel', 'Stop an authorized run, preserving collected partial artifacts. Does not delete evidence.', { runId: id }, post(i => `/api/runs/${i.runId}/cancel`), true),
];

export async function invoke(client, name, input, { allowWrite = true, signal } = {}) {
  const operation = operations.find(op => op.name === name);
  if (!operation) throw new InterfaceError('UNKNOWN_OPERATION', `Unknown operation: ${name}`);
  if (operation.write && !allowWrite) throw new InterfaceError('READ_ONLY', 'Write tools are disabled. Restart the MCP server with --allow-write only when you intend to allow task creation and execution.');
  const parsed = operation.schema.safeParse(input);
  if (!parsed.success) throw new InterfaceError('INVALID_ARGUMENTS', 'Invalid operation arguments.', parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })));
  return operation.run(client, parsed.data, signal);
}

import type { MessagePart, RunEvent } from '../shared/contracts.ts';

/** Read-only projection. Original messages/events stay intact, including legacy runs. */
export function projectMessageParts(events: RunEvent[]) {
  const runs = new Map<string, Map<string, MessagePart>>();
  for (const event of events) {
    const item = event.data.item as Record<string, unknown> | undefined;
    const delta = event.kind === 'assistant.delta';
    if (!delta && (!['tool.started', 'tool.completed'].includes(event.kind) || item?.type !== 'agentMessage')) continue;
    const id = String(delta ? event.data.itemId || 'legacy' : item?.id || 'legacy');
    if (!runs.has(event.runId)) runs.set(event.runId, new Map());
    const parts = runs.get(event.runId)!;
    const previous = parts.get(id);
    parts.set(id, {
      id, at: previous?.at || event.createdAt,
      phase: typeof item?.phase === 'string' ? item.phase : previous?.phase,
      text: delta ? (previous?.text || '') + String(event.data.text || '') : typeof item?.text === 'string' && item.text ? item.text : previous?.text || '',
    });
  }
  return new Map([...runs].map(([id, parts]) => [id, [...parts.values()].filter(part => part.text)]));
}

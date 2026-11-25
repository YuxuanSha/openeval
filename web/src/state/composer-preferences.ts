import { isPermissionMode, type PermissionMode } from '../../../shared/permissions';
import type { Capabilities, Intent } from '../contract';

const key = 'openeval-composer-preferences-v1';
const intents: Intent[] = ['chat', 'standard', 'dataset', 'evaluate', 'analyze', 'report'];
export interface ComposerPreferences {
  model: string;
  effortByModel: Record<string, string>;
  permission: PermissionMode;
  intent: Intent;
  goal: boolean;
}
export function readComposerPreferences(storage: Pick<Storage, 'getItem'>): ComposerPreferences {
  let saved: Partial<ComposerPreferences> | null = null;
  try { saved = JSON.parse(storage.getItem(key) || 'null'); } catch { /* Keep safe defaults. */ }
  const entries = saved?.effortByModel && typeof saved.effortByModel === 'object' && !Array.isArray(saved.effortByModel)
    ? Object.entries(saved.effortByModel).filter(([k, v]) => k.length <= 200 && typeof v === 'string' && v.length <= 32) : [];
  return {
    model: typeof saved?.model === 'string' ? saved.model : '',
    effortByModel: Object.fromEntries(entries),
    permission: isPermissionMode(saved?.permission) ? saved.permission : 'ask',
    intent: intents.includes(saved?.intent as Intent) ? saved!.intent! : 'chat',
    goal: saved?.goal === true,
  };
}
export function saveComposerPreferences(storage: Pick<Storage, 'setItem'>, prefs: ComposerPreferences) {
  try { storage.setItem(key, JSON.stringify(prefs)); } catch { /* Keep session preferences if storage is unavailable. */ }
}
export function selectedModelAndEffort(prefs: ComposerPreferences, capabilities?: Capabilities) {
  const models = capabilities?.models;
  if (!models?.length) return { model: prefs.model, reasoning: '' };
  const selected = models.find(m => m.id === prefs.model) || models.find(m => m.id === capabilities?.defaultModel) || models[0];
  const saved = Object.hasOwn(prefs.effortByModel, selected.id) ? prefs.effortByModel[selected.id] : '';
  return { model: selected.id, reasoning: selected.reasoning.includes(saved) ? saved : '' };
}

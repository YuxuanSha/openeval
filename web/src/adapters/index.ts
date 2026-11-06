import { HttpAdapter } from './http';
import type { EvalAdapter } from '../contract';
// The distributable product only uses the local Codex backend. No bundled private fixtures.
export const isDemo = false;
export const adapter: EvalAdapter = new HttpAdapter((import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.VITE_EVAL_API_BASE || '/api');

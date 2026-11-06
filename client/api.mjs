import { createHash } from 'node:crypto';

export class InterfaceError extends Error {
  constructor(code, message, details, status) {
    super(message); this.code = code; this.details = details; this.status = status;
  }
}

export function localURL(value = process.env.OPENEVAL_URL ?? 'http://127.0.0.1:4318') {
  let url;
  try { url = new URL(value); } catch { throw new InterfaceError('INVALID_URL', 'Use an explicit local URL, e.g. http://127.0.0.1:4318'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new InterfaceError('LOCAL_ONLY', 'OpenEval interfaces only connect to loopback HTTP origins, without credentials, paths or query strings.');
  }
  // Avoid DNS resolution even for localhost. The service listens on IPv4 loopback.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.origin;
}

export class OpenEvalClient {
  constructor({ url, timeout = 15000 } = {}) {
    this.url = localURL(url);
    if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 120000) throw new InterfaceError('INVALID_TIMEOUT', 'Timeout must be 100–120000 milliseconds.');
    this.timeout = timeout;
  }
  async request(path, { method = 'GET', body, binary = false, maxBytes = 64 * 1024 * 1024, signal } = {}) {
    if (!path.startsWith('/api/') || path.split('?')[0].includes('..') || path.includes('#')) throw new InterfaceError('INVALID_PATH', 'Invalid API path.');
    const signals = [AbortSignal.timeout(this.timeout), ...(signal ? [signal] : [])];
    let response;
    try {
      response = await fetch(this.url + path, {
        method, redirect: 'error', signal: AbortSignal.any(signals),
        headers: { Accept: binary ? '*/*' : 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const parts = []; let size = 0;
      for await (const part of response.body) {
        size += part.byteLength;
        if (size > maxBytes) throw new InterfaceError('RESPONSE_TOO_LARGE', `Response exceeds ${maxBytes} bytes. Use CLI download for large artifacts.`);
        parts.push(part);
      }
      const bytes = Buffer.concat(parts);
      if (!response.ok) {
        let error;
        try { error = JSON.parse(bytes.toString()).error; } catch {}
        throw new InterfaceError(error?.code ?? 'HTTP_ERROR', error?.message ?? `HTTP ${response.status}`, error?.details, response.status);
      }
      if (binary) return { bytes, mime: response.headers.get('content-type') ?? 'application/octet-stream' };
      if (!response.headers.get('content-type')?.includes('application/json')) throw new InterfaceError('INVALID_RESPONSE', 'The local service did not return OpenEval JSON.');
      try { return JSON.parse(bytes.toString()); } catch { throw new InterfaceError('INVALID_RESPONSE', 'The local service returned invalid JSON.'); }
    } catch (error) {
      if (error instanceof InterfaceError) throw error;
      if (signal?.aborted) throw new InterfaceError('CANCELLED', 'Interface request cancelled. Any submitted run remains in OpenEval; inspect it before retrying.');
      const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
      throw new InterfaceError(timeout ? 'TIMEOUT' : 'CONNECTION_FAILED', timeout ?
        'OpenEval request timed out. A write may have completed; inspect the task or reuse the same requestId before retrying.' :
        `Cannot reach OpenEval at ${this.url}. Start the desktop app or openeval serve. Writes are never automatically retried.`);
    }
  }
  async health(options) {
    const health = await this.request('/api/health', options);
    if (health?.ok !== true || health.runtime !== 'codex' || typeof health.version !== 'string' || !health.instance?.id) {
      throw new InterfaceError('WRONG_SERVICE', 'This endpoint is not a compatible OpenEval service.');
    }
    return health;
  }
  async write(path, body, options = {}) {
    await this.health(options);
    return this.request(path, { ...options, method: 'POST', body });
  }
  async download(kind, id, options = {}) {
    if (!['versions', 'artifacts'].includes(kind) || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new InterfaceError('INVALID_ID', 'A valid version or artifact ID is required.');
    await this.health(options);
    return this.request(`/api/${kind}/${id}/download`, { ...options, binary: true });
  }
}

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function errorEnvelope(error) {
  return { error: { code: error.code ?? 'INTERFACE_ERROR', message: error.message, ...(error.details ? { details: error.details } : {}) } };
}

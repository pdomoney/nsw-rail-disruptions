import { API_BASE } from '../config/feeds.js';

export class HttpError extends Error {
  constructor(status, url, detail) {
    super(`HTTP ${status} for ${url}${detail ? ` (${detail})` : ''}`);
    this.status = status;
  }
}

function apiKey() {
  const k = (process.env.TFNSW_API_KEY || '').trim();
  if (!k) throw new Error('TFNSW_API_KEY is not set');
  return k.replace(/^apikey\s+/i, '');
}

export async function tfnswGet(pathOrUrl, { params = null, timeoutMs = 45_000, retries = 2, accept = '*/*' } = {}) {
  const base = process.env.TFNSW_API_BASE || API_BASE;
  const url = new URL(pathOrUrl.startsWith('http') ? pathOrUrl : base + pathOrUrl);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 1500 * attempt));
    try {
      const res = await fetch(url, {
        headers: { Authorization: `apikey ${apiKey()}`, Accept: accept },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const detail = res.headers.get('x-error-detail') || (await res.text().catch(() => '')).slice(0, 160);
        const err = new HttpError(res.status, url.pathname, detail);
        // 4xx other than rate limiting will not get better by retrying.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw Object.assign(err, { fatal: true });
        throw err;
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
    }
  }
  throw lastErr;
}

// Try each candidate path until one works. Returns { buf, path }.
export async function tfnswGetFirst(paths, opts) {
  let lastErr;
  for (const p of paths) {
    try {
      return { buf: await tfnswGet(p, opts), path: p };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

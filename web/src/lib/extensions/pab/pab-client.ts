/**
 * Minimal PAB (orchestrator) HTTP client for extension pages.
 * Credentials: env (build-time) and/or localStorage (operator paste).
 *
 * Env (Vite):
 *   VITE_PAB_API_BASE   e.g. https://api.example.com or http://127.0.0.1:8100
 *   VITE_PAB_TENANT     sitename (X-Tenant)
 *   VITE_PAB_PASSPORT   optional dev passport (prefer localStorage in browser)
 *
 * localStorage keys (override env):
 *   pab_api_base, pab_tenant, pab_passport
 */

export type PabConfig = {
  apiBase: string;
  tenant: string;
  passport: string;
};

const LS_BASE = 'pab_api_base';
const LS_TENANT = 'pab_tenant';
const LS_PASSPORT = 'pab_passport';

export function getPabConfig(): PabConfig | null {
  const apiBase = (
    (typeof localStorage !== 'undefined' && localStorage.getItem(LS_BASE)) ||
    import.meta.env.VITE_PAB_API_BASE ||
    ''
  )
    .toString()
    .replace(/\/$/, '');
  const tenant = (
    (typeof localStorage !== 'undefined' && localStorage.getItem(LS_TENANT)) ||
    import.meta.env.VITE_PAB_TENANT ||
    ''
  ).toString();
  const passport = (
    (typeof localStorage !== 'undefined' && localStorage.getItem(LS_PASSPORT)) ||
    import.meta.env.VITE_PAB_PASSPORT ||
    ''
  ).toString();

  if (!apiBase || !tenant || !passport) {
    return null;
  }
  return { apiBase, tenant, passport };
}

export function savePabConfig(partial: Partial<PabConfig>) {
  if (typeof localStorage === 'undefined') {
    return;
  }
  if (partial.apiBase != null) {
    localStorage.setItem(LS_BASE, partial.apiBase.replace(/\/$/, ''));
  }
  if (partial.tenant != null) {
    localStorage.setItem(LS_TENANT, partial.tenant);
  }
  if (partial.passport != null) {
    localStorage.setItem(LS_PASSPORT, partial.passport);
  }
}

export function clearPabPassport() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(LS_PASSPORT);
  }
}

export class PabError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function pabFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = getPabConfig();
  if (!cfg) {
    throw new PabError(0, 'PAB not configured (api base, tenant, passport)');
  }
  const url = path.startsWith('http') ? path : `${cfg.apiBase}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers = new Headers(init.headers || {});
  headers.set('X-Tenant', cfg.tenant);
  headers.set('X-Auth-Key', cfg.passport);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: string }).error)
        : `PAB HTTP ${res.status}`;
    throw new PabError(res.status, msg, data);
  }
  return data as T;
}

/** Absolute URL for a relative PAB media path (e.g. /photos/hash/thumb). */
export function pabMediaUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) {
    return null;
  }
  const cfg = getPabConfig();
  if (!cfg) {
    return null;
  }
  if (relativePath.startsWith('http')) {
    return relativePath;
  }
  // thumb/full need auth headers — browser <img> cannot send them.
  // Use query auth only if we later add token URLs; for now return API path for fetch-blob use.
  return `${cfg.apiBase}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
}

export type ActivityBuckets = {
  per_page: number;
  comments: Array<{
    kind: string;
    id: number;
    photo_hash: string;
    body: string;
    author_user_id: number | null;
    created_at: string;
    thumbnail_url: string;
  }> | null;
  reactions: Array<{
    kind: string;
    id: number;
    photo_hash: string;
    type: string;
    user_id: number;
    created_at: string;
    thumbnail_url: string;
  }> | null;
  photos: Array<{
    kind: string;
    photo_hash: string;
    filename: string;
    caption: string | null;
    timestamp: string | null;
    created_at: string;
    gps: { lat: number; lon: number } | null;
    thumbnail_url: string;
  }> | null;
  ledger: Array<{
    kind: string;
    id: number;
    subject: string;
    event: string;
    amount: number | null;
    currency: string | null;
    description: string | null;
    text: string | null;
    transaction_date: string;
    created_at: string;
    user_id: number | null;
  }> | null;
};

export async function fetchActivityDashboard(perPage = 25): Promise<ActivityBuckets> {
  const q = new URLSearchParams({
    kinds: 'comment,reaction,photo,ledger',
    per_page: String(perPage),
  });
  return pabFetch<ActivityBuckets>(`/activity?${q}`);
}

export async function postComment(photoHash: string, body: string) {
  return pabFetch(`/photos/${encodeURIComponent(photoHash)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export async function postLike(photoHash: string) {
  return pabFetch(`/photos/${encodeURIComponent(photoHash)}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ type: 'like' }),
  });
}

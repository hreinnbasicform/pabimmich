/**
 * Minimal PAB (orchestrator) HTTP client for extension pages.
 *
 * Resolution order (never uses custom ports like :8100):
 *   apiBase:  localStorage pab_api_base → VITE_PAB_API_BASE → same-origin `/pab-api` → public apex
 *   tenant:   localStorage pab_tenant → VITE_PAB_TENANT → first DNS label of hostname
 *   passport: localStorage pab_passport → VITE_PAB_PASSPORT (required for auth'd routes)
 *
 * On site hosts (`<sitename>.domain`), nginx proxies `/pab-api/*` and `/client-errors`
 * to the orchestrator so the browser stays on :443 only.
 */

export type PabConfig = {
  apiBase: string;
  tenant: string;
  passport: string;
};

const LS_BASE = 'pab_api_base';
const LS_TENANT = 'pab_tenant';
const LS_PASSPORT = 'pab_passport';

/** Remove explicit :port from an origin/base URL. */
export function stripUrlPort(base: string): string {
  if (!base) return base;
  try {
    // Relative paths (e.g. /pab-api) — leave alone
    if (base.startsWith('/')) return base.replace(/\/$/, '') || '/';
    const u = new URL(base, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
    u.port = '';
    // URL with only path after strip
    if (u.pathname && u.pathname !== '/' && !base.includes('://')) {
      return u.pathname.replace(/\/$/, '');
    }
    const out = u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, ''));
    return out;
  } catch {
    return base.replace(/:\d+(?=\/|$)/, '').replace(/\/$/, '');
  }
}

/** Tenant sitename from hostname: catlinkv2.pab-test.example.invalid → catlinkv2 */
export function tenantFromHostname(hostname?: string): string {
  if (typeof window === 'undefined' && !hostname) return '';
  const host = (hostname || window.location.hostname || '').toLowerCase();
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 3) return '';
  const sub = parts[0];
  if (['www', 'api', 'padmin', 'admin', 'app'].includes(sub)) return '';
  return sub;
}

/**
 * Default API base without custom ports:
 * 1. same-origin `/pab-api` when on a site subdomain (nginx proxies to orchestrator)
 * 2. else current origin (apex already serves orchestrator)
 */
export function defaultPabApiBase(): string {
  if (typeof window === 'undefined') return '';
  const tenant = tenantFromHostname();
  if (tenant) {
    // Site Immich host — talk via same-origin reverse proxy (no :8100)
    return `${window.location.origin}/pab-api`;
  }
  return stripUrlPort(window.location.origin);
}

export function getPabConfig(): PabConfig | null {
  const fromLs = (k: string) =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(k) || '' : '';

  let apiBase = (
    fromLs(LS_BASE) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PAB_API_BASE) ||
    (typeof window !== 'undefined' && (window as unknown as { __PAB_API_BASE__?: string }).__PAB_API_BASE__) ||
    defaultPabApiBase() ||
    ''
  )
    .toString()
    .trim();

  // Hard rule: never keep a custom port (user requirement)
  apiBase = stripUrlPort(apiBase);
  // If someone stored :8100 historically, rewrite to /pab-api on site hosts
  if (/:8100\b/.test(fromLs(LS_BASE) || '') || apiBase.includes(':8100')) {
    apiBase = defaultPabApiBase();
  }

  const tenant = (
    fromLs(LS_TENANT) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PAB_TENANT) ||
    (typeof window !== 'undefined' && (window as unknown as { __PAB_SITENAME__?: string }).__PAB_SITENAME__) ||
    tenantFromHostname() ||
    ''
  )
    .toString()
    .trim();

  const passport = (
    fromLs(LS_PASSPORT) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PAB_PASSPORT) ||
    (typeof window !== 'undefined' && (window as unknown as { __PAB_PASSPORT__?: string }).__PAB_PASSPORT__) ||
    ''
  )
    .toString()
    .trim();

  if (!apiBase || !tenant || !passport) {
    return null;
  }
  return { apiBase, tenant, passport };
}

const LS_WEB_EXP = 'pab_web_exp';

/**
 * Exchange Immich session cookie for a short-lived PAB web token (automatic; no passport paste).
 * Stores token in localStorage as pab_passport.
 */
export async function ensurePabWebAuth(force = false): Promise<PabConfig | null> {
  if (typeof window === 'undefined') return null;
  const existing = getPabConfig();
  const exp = parseInt(
    (typeof localStorage !== 'undefined' && localStorage.getItem(LS_WEB_EXP)) || '0',
    10,
  );
  if (!force && existing?.passport.startsWith('pabw.') && exp > Date.now() / 1000 + 60) {
    return existing;
  }
  if (!force && existing && !existing.passport.startsWith('pabw.')) {
    return existing; // long-lived site passport
  }

  const apiBase = stripUrlPort(defaultPabApiBase());
  const tenant =
    tenantFromHostname() ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem(LS_TENANT) || '' : '') ||
    '';
  if (!apiBase || !tenant) return null;

  const res = await fetch(`${apiBase}/web-auth`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json', 'X-Tenant': tenant },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { token?: string; tenant?: string; expires_at?: string };
  if (!data.token) return null;
  savePabConfig({ apiBase, tenant: data.tenant || tenant, passport: data.token });
  if (data.expires_at && typeof localStorage !== 'undefined') {
    localStorage.setItem(LS_WEB_EXP, String(Math.floor(new Date(data.expires_at).getTime() / 1000)));
  }
  return getPabConfig();
}

/** Partial config status for UI (what is missing). */
export function getPabConfigStatus(): {
  apiBase: string;
  tenant: string;
  hasPassport: boolean;
  ready: boolean;
  missing: string[];
} {
  const apiBase = stripUrlPort(
    (
      (typeof localStorage !== 'undefined' && localStorage.getItem(LS_BASE)) ||
      defaultPabApiBase() ||
      ''
    ).toString(),
  );
  const tenant =
    (typeof localStorage !== 'undefined' && localStorage.getItem(LS_TENANT)) ||
    tenantFromHostname() ||
    '';
  const hasPassport = !!(
    (typeof localStorage !== 'undefined' && localStorage.getItem(LS_PASSPORT)) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PAB_PASSPORT)
  );
  const missing: string[] = [];
  if (!apiBase) missing.push('apiBase');
  if (!tenant) missing.push('tenant');
  if (!hasPassport) missing.push('passport');
  return { apiBase, tenant, hasPassport, ready: missing.length === 0, missing };
}

export function savePabConfig(partial: Partial<PabConfig>) {
  if (typeof localStorage === 'undefined') {
    return;
  }
  if (partial.apiBase != null) {
    localStorage.setItem(LS_BASE, stripUrlPort(partial.apiBase));
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
  // Prefer Immich-session web-auth so extension pages work without paste.
  let cfg = (await ensurePabWebAuth()) || getPabConfig();
  if (!cfg) {
    const st = getPabConfigStatus();
    throw new PabError(
      0,
      st.hasPassport
        ? 'PAB not configured (api base / tenant)'
        : 'Sign in to Immich on a site host — PAB web-auth could not mint a token (or set pab_passport).',
    );
  }
  const url = path.startsWith('http')
    ? stripUrlPort(path)
    : `${cfg.apiBase}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers = new Headers(init.headers || {});
  headers.set('X-Tenant', cfg.tenant);
  headers.set('X-Auth-Key', cfg.passport);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let res = await fetch(url, { ...init, headers, credentials: init.credentials ?? 'include' });
  // One refresh on 401/403 for expired web tokens
  if ((res.status === 401 || res.status === 403) && cfg.passport.startsWith('pabw.')) {
    cfg = (await ensurePabWebAuth(true)) || cfg;
    headers.set('X-Auth-Key', cfg.passport);
    headers.set('X-Tenant', cfg.tenant);
    res = await fetch(url, { ...init, headers, credentials: init.credentials ?? 'include' });
  }
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
    return stripUrlPort(relativePath);
  }
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

export type PabAuthor = {
  user_id: number | null;
  email: string | null;
  display_name: string | null;
};

export type PabComment = {
  id: number;
  body: string;
  author: PabAuthor;
  created_at: string;
};

export type PabCommentsList = {
  photo_hash: string;
  total: number;
  page: number;
  per_page: number;
  comments: PabComment[];
};

export type PabPhotoMeta = {
  photo_hash: string;
  filename?: string;
  engine_asset_id?: string | null;
  thumbnail_url?: string;
  full_url?: string;
};

/** Resolve Immich asset UUID → PAB photo_hash (requires engine_asset_id link on upload). */
export async function resolvePhotoByEngineAsset(assetId: string): Promise<PabPhotoMeta> {
  return pabFetch<PabPhotoMeta>(`/photos/by-engine-asset/${encodeURIComponent(assetId)}`);
}

export async function listComments(photoHash: string, page = 1, perPage = 50): Promise<PabCommentsList> {
  const q = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  return pabFetch<PabCommentsList>(`/photos/${encodeURIComponent(photoHash)}/comments?${q}`);
}

export async function postComment(photoHash: string, body: string) {
  return pabFetch<PabComment & { photo_hash: string; author_user_id?: number | null }>(
    `/photos/${encodeURIComponent(photoHash)}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ body }),
    },
  );
}

export async function deleteComment(photoHash: string, commentId: number) {
  return pabFetch<{ id: number; deleted: boolean }>(
    `/photos/${encodeURIComponent(photoHash)}/comments/${commentId}`,
    { method: 'DELETE' },
  );
}

export async function postLike(photoHash: string) {
  return pabFetch(`/photos/${encodeURIComponent(photoHash)}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ type: 'like' }),
  });
}

export async function listReactions(photoHash: string) {
  return pabFetch<{
    photo_hash: string;
    counts: Record<string, number>;
    mine: Array<{ id: number; type: string }>;
    total: number;
  }>(`/photos/${encodeURIComponent(photoHash)}/reactions`);
}

/**
 * PhotoAppBackend client-side error reporter.
 *
 * Best-effort, dependency-free, throttled. Reports uncaught JS errors and
 * unhandled promise rejections to the PAB orchestrator's `POST /client-errors`.
 *
 * Endpoint resolution (never uses a custom port like :8100):
 *   1. `window.__PAB_ERROR_URL__` if set
 *   2. same-origin `/client-errors` (site nginx proxies to orchestrator)
 *   3. apex of current host (e.g. https://pab-test.example.invalid/client-errors)
 *
 * Never throws, never blocks; failures are swallowed.
 */

const MAX_PER_LOAD = 25;
let sent = 0;
let initialised = false;

/** Strip :port from a URL origin; never target non-default ports. */
function stripPort(url: string): string {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.href : 'https://localhost');
    u.port = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.replace(/:\d+(?=\/|$)/, '');
  }
}

/**
 * Public API apex for this install: e.g. sitename.pab-test.example.invalid → https://pab-test.example.invalid
 * Reserved labels (www, api, padmin, admin, app) stay on current host without port.
 */
export function pabPublicApexOrigin(): string {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname } = window.location;
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const sub = parts[0].toLowerCase();
    if (!['www', 'api', 'padmin', 'admin', 'app', 'localhost'].includes(sub)) {
      return `${protocol}//${parts.slice(1).join('.')}`;
    }
  }
  return stripPort(`${protocol}//${hostname}`);
}

function endpoint(): string {
  const override = (globalThis as unknown as { __PAB_ERROR_URL__?: string }).__PAB_ERROR_URL__;
  if (override) return stripPort(override.startsWith('http') ? override : `${window.location.origin}${override}`);

  // Prefer same-origin path (nginx on <site>.domain proxies /client-errors → orchestrator).
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/client-errors`;
  }
  return '/client-errors';
}

export function reportPabError(payload: Record<string, unknown>): void {
  if (typeof window === 'undefined' || sent >= MAX_PER_LOAD) return;
  sent++;
  try {
    const sitename =
      (globalThis as unknown as { __PAB_SITENAME__?: string }).__PAB_SITENAME__ ||
      (() => {
        const h = window.location.hostname.split('.');
        return h.length >= 3 ? h[0] : undefined;
      })();
    const body = JSON.stringify({
      ...payload,
      sitename,
      url: window.location.href,
      user_agent: navigator.userAgent,
    });
    void fetch(endpoint(), {
      method: 'POST',
      mode: 'cors',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {
      /* best-effort */
    });
  } catch {
    /* best-effort */
  }
}

export function initPabErrorReporter(): void {
  if (typeof window === 'undefined' || initialised) return;
  initialised = true;
  window.addEventListener('error', (e: ErrorEvent) => {
    reportPabError({
      kind: 'error',
      message: e.message,
      source: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error?.stack,
    });
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined;
    reportPabError({
      kind: 'unhandledrejection',
      message: reason?.message ? String(reason.message) : String(e.reason),
      stack: reason?.stack,
    });
  });
}

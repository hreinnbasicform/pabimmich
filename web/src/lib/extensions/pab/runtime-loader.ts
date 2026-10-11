/**
 * Load external PAB UI scripts from `/pab-ui/` (host-mounted into Immich www).
 *
 * IMPORTANT: use classic <script> tags — not dynamic import().
 * Vite rewrites import() against the bundle URL and external host files are
 * plain IIFEs (not ESM), so import() never registers the custom elements.
 */

type Manifest = {
  scripts?: string[];
  version?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __PAB_UI_LOADED__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __PAB_UI_LOAD_ERROR__: string | undefined;
}

let loadPromise: Promise<void> | null = null;

export function pabUiBase(): string {
  return '/pab-ui';
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve();
      return;
    }
    const key = src.split('?')[0];
    const safeKey = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const existing = document.querySelector(`script[data-pab-ui-src="${safeKey}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.pabUiReady === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.pabUiSrc = key;
    s.onload = () => {
      s.dataset.pabUiReady = '1';
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * Fetch manifest and inject listed scripts. Safe to call multiple times (singleton).
 */
export function ensurePabUiLoaded(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  // Already registered by boot.js or a prior load
  if (customElements.get('pab-asset-comments')) {
    window.__PAB_UI_LOADED__ = true;
    return Promise.resolve();
  }
  if (window.__PAB_UI_LOADED__) {
    return Promise.resolve();
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const base = pabUiBase();
    window.__PAB_UI_LOAD_ERROR__ = undefined;
    try {
      const res = await fetch(`${base}/manifest.json`, { cache: 'no-store' });
      if (!res.ok) {
        const msg = `manifest HTTP ${res.status}`;
        console.warn('[pab-ui]', msg);
        window.__PAB_UI_LOAD_ERROR__ = msg;
        // Fallback: try known script directly
        await loadScript(`${base}/asset-comments.js?v=${Date.now()}`);
      } else {
        const man = (await res.json()) as Manifest;
        const bust = man.version || String(Date.now());
        const scripts = Array.isArray(man.scripts) && man.scripts.length ? man.scripts : ['asset-comments.js'];
        for (const rel of scripts) {
          if (!rel || typeof rel !== 'string') continue;
          const url =
            rel.startsWith('http') || rel.startsWith('/')
              ? rel
              : `${base}/${rel.replace(/^\//, '')}`;
          const full = url.includes('?')
            ? `${url}&v=${encodeURIComponent(bust)}`
            : `${url}?v=${encodeURIComponent(bust)}`;
          await loadScript(full);
        }
      }

      // Wait briefly for customElements.define to run
      if (!customElements.get('pab-asset-comments')) {
        try {
          await Promise.race([
            customElements.whenDefined('pab-asset-comments'),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout waiting for pab-asset-comments')), 3000)),
          ]);
        } catch {
          /* checked below */
        }
      }

      if (customElements.get('pab-asset-comments')) {
        window.__PAB_UI_LOADED__ = true;
      } else {
        window.__PAB_UI_LOAD_ERROR__ =
          window.__PAB_UI_LOAD_ERROR__ || 'script loaded but custom element pab-asset-comments not defined';
        console.warn('[pab-ui]', window.__PAB_UI_LOAD_ERROR__);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.__PAB_UI_LOAD_ERROR__ = msg;
      console.warn('[pab-ui] failed to load external extensions', e);
    }
  })();

  return loadPromise;
}

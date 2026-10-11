/**
 * Immich web extension: load host-mounted site scripts (gtag + header/footer overrides).
 *
 * Implementation lives in `/pab-ui/site-scripts.js` + `site-scripts-config.json`
 * so analytics and extra tags can change without rebuilding Immich.
 *
 * Override without rebuild:
 *   - Edit `/pab-ui/site-scripts-config.json` on the host, or
 *   - Set `window.__PAB_SITE_SCRIPTS_OVERRIDE__ = { gtagId, header, footer }` before load, or
 *   - Call `window.PabSiteScripts.setHeader([...])` / `.setFooter([...])` at runtime
 */
import { ensurePabUiLoaded } from '$lib/extensions/pab/runtime-loader';

const SITE_SCRIPTS = '/pab-ui/site-scripts.js';

function loadSiteScriptsScript(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector('script[data-pab-ui-src*="site-scripts"]')) return;

  const s = document.createElement('script');
  s.src = `${SITE_SCRIPTS}?v=${Date.now()}`;
  s.async = true;
  s.dataset.pabUiSrc = SITE_SCRIPTS;
  s.onerror = () => console.warn('[pab] site-scripts.js failed to load');
  document.head.appendChild(s);
}

/**
 * Register / kick site scripts. Safe to call multiple times.
 * Also ensures the broader pab-ui manifest scripts load (comments CE, etc.).
 */
export function registerPabSiteScriptsExtension(): void {
  // Prefer early direct load so gtag is not blocked on comments CE
  loadSiteScriptsScript();
  // Also pull manifest-driven scripts (includes site-scripts.js when listed)
  void ensurePabUiLoaded().catch(() => {
    /* site-scripts may still have loaded directly */
  });
}

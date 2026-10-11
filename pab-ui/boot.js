/**
 * Early bootstrap — never :8100. Loads comments CE (cache-busted filename).
 * Also: site existence gate (404 UI fallback), login site banner, password-manager attrs.
 */
(function () {
  try {
    var RESERVED = ['www', 'api', 'padmin', 'admin', 'app', 'mail', 'smtp', 'ftp', 'static'];
    var host = (location.hostname || '').toLowerCase();
    var parts = host.split('.').filter(Boolean);
    var sub = parts.length >= 3 ? parts[0] : '';
    if (sub && RESERVED.indexOf(sub) === -1) {
      window.__PAB_SITENAME__ = sub;
      window.__PAB_API_BASE__ = location.origin + '/pab-api';
    } else {
      window.__PAB_API_BASE__ = location.origin;
    }
    window.__PAB_ERROR_URL__ = location.origin + '/client-errors';
    try {
      var stored = localStorage.getItem('pab_api_base') || '';
      if (/:8100\b/.test(stored) || /^https?:\/\/[^/]+:\d+/.test(stored)) {
        localStorage.setItem('pab_api_base', window.__PAB_API_BASE__);
      }
      if (!localStorage.getItem('pab_tenant') && window.__PAB_SITENAME__) {
        localStorage.setItem('pab_tenant', window.__PAB_SITENAME__);
      }
    } catch (_) {}

    function loadScript(src, onload) {
      if (document.querySelector('script[data-pab-ui-src="' + src + '"]')) return;
      var s = document.createElement('script');
      s.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
      s.async = true;
      s.dataset.pabUiSrc = src;
      if (onload) s.onload = onload;
      s.onerror = function () {
        console.warn('[pab-ui] failed to load', src);
      };
      (document.head || document.documentElement).appendChild(s);
    }

    function showSiteNotFound(sitename) {
      try {
        document.documentElement.innerHTML =
          '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>' +
          '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
          '<title>404 — Site not found</title>' +
          '<style>body{font-family:system-ui,Segoe UI,sans-serif;display:grid;place-items:center;' +
          'min-height:100vh;margin:0;background:#0f1419;color:#e6edf3}.c{text-align:center;max-width:28rem;padding:2rem}' +
          'h1{font-size:1.5rem;margin:0 0 .5rem}p{color:#8b949e;line-height:1.5}' +
          '.code{font-family:ui-monospace,monospace;color:#c9d1d9;background:#161b22;padding:.15rem .45rem;border-radius:6px}</style>' +
          '</head><body><div class="c"><h1>404 — Site not found</h1>' +
          '<p>No photo library exists at <span class="code">' +
          String(sitename || host).replace(/</g, '') +
          '</span>.</p>' +
          '<p>Check the address or create the site first.</p></div></body></html>';
      } catch (e) {
        console.warn('[pab-ui] 404 render failed', e);
      }
    }

    /** Client-side fallback when nginx auth_request is not yet deployed */
    function checkSiteExists(sitename) {
      if (!sitename) return;
      var base = window.__PAB_API_BASE__ || location.origin + '/pab-api';
      var url = base + '/pab/site-info?name=' + encodeURIComponent(sitename);
      fetch(url, { credentials: 'omit', headers: { Accept: 'application/json' } })
        .then(function (r) {
          if (r.status === 404) {
            showSiteNotFound(sitename);
            return null;
          }
          if (!r.ok) return null;
          return r.json();
        })
        .then(function (body) {
          if (!body) return;
          if (body.exists === false) {
            showSiteNotFound(sitename);
            return;
          }
          if (body.sitename || body.display_name) {
            window.__PAB_SITE_DISPLAY__ = body.display_name || body.sitename;
          }
          enhanceLoginPage();
        })
        .catch(function () {
          /* nginx gate is authoritative when present */
        });
    }

    function isLoginPath() {
      var p = (location.pathname || '').replace(/\/+$/, '') || '/';
      return p === '/auth/login' || p.indexOf('/auth/login') === 0;
    }

    function ensureLoginBanner(sitename) {
      if (!sitename || !isLoginPath()) return;
      if (document.querySelector('[data-pab-site-banner]')) return;
      var banner = document.createElement('div');
      banner.setAttribute('data-pab-site-banner', '1');
      banner.setAttribute('role', 'status');
      banner.style.cssText =
        'margin:0 0 1rem;padding:.85rem 1rem;border-radius:12px;text-align:center;' +
        'border:1px solid rgba(108,77,255,.35);background:rgba(108,77,255,.12);' +
        'font-family:system-ui,Segoe UI,sans-serif';
      banner.innerHTML =
        '<div style="font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;opacity:.7;margin-bottom:.15rem">Signing in to</div>' +
        '<div style="font-size:1.35rem;font-weight:700;letter-spacing:-.02em;color:#6C4DFF">' +
        String(sitename).replace(/[<>&]/g, '') +
        '</div>';
      // Prefer inside auth card body; fall back to top of body
      var card =
        document.querySelector('form#login-form') ||
        document.querySelector('form[name="login"]') ||
        document.querySelector('form');
      if (card && card.parentNode) {
        card.parentNode.insertBefore(banner, card);
      } else {
        var hostEl = document.querySelector('main, section, body');
        if (hostEl) hostEl.insertBefore(banner, hostEl.firstChild);
      }
      try {
        document.title = 'Sign in to ' + sitename + ' — PhotoAppBackend';
      } catch (_) {}
    }

    /** Mark username/password so browsers and password managers can store credentials */
    function markPasswordManagerFields() {
      if (!isLoginPath()) return;
      var forms = document.querySelectorAll('form');
      for (var i = 0; i < forms.length; i++) {
        var form = forms[i];
        var hasPw = form.querySelector('input[type="password"]');
        if (!hasPw) continue;
        if (!form.getAttribute('autocomplete')) form.setAttribute('autocomplete', 'on');
        if (!form.getAttribute('name')) form.setAttribute('name', 'login');
        if (!form.id) form.id = 'login-form';
        form.setAttribute('method', form.getAttribute('method') || 'post');

        var email =
          form.querySelector('input[type="email"]') ||
          form.querySelector('input[name="email"]') ||
          form.querySelector('input[autocomplete="email"]') ||
          form.querySelector('input[id="email"]');
        if (email) {
          // password managers key off autocomplete=username for the login id field
          email.setAttribute('name', 'username');
          email.setAttribute('autocomplete', 'username');
          email.setAttribute('autocapitalize', 'none');
          email.setAttribute('autocorrect', 'off');
          email.setAttribute('spellcheck', 'false');
          if (!email.id) email.id = 'email';
        }

        var pw =
          form.querySelector('input[type="password"]') ||
          form.querySelector('input[id="password"]');
        if (pw) {
          pw.setAttribute('name', 'password');
          pw.setAttribute('autocomplete', 'current-password');
          if (!pw.id) pw.id = 'password';
        }
      }
    }

    function enhanceLoginPage() {
      var sitename = window.__PAB_SITE_DISPLAY__ || window.__PAB_SITENAME__;
      ensureLoginBanner(sitename);
      markPasswordManagerFields();
    }

    // Observe SPA navigations / late form render
    function watchLogin() {
      if (!window.__PAB_SITENAME__) return;
      var obs = new MutationObserver(function () {
        if (isLoginPath()) enhanceLoginPage();
      });
      if (document.documentElement) {
        obs.observe(document.documentElement, { childList: true, subtree: true });
      }
      // also re-run on history changes
      var push = history.pushState;
      var replace = history.replaceState;
      function onNav() {
        setTimeout(enhanceLoginPage, 50);
      }
      history.pushState = function () {
        var r = push.apply(this, arguments);
        onNav();
        return r;
      };
      history.replaceState = function () {
        var r = replace.apply(this, arguments);
        onNav();
        return r;
      };
      window.addEventListener('popstate', onNav);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhanceLoginPage);
      } else {
        enhanceLoginPage();
      }
      setTimeout(enhanceLoginPage, 300);
      setTimeout(enhanceLoginPage, 1200);
    }

    if (window.__PAB_SITENAME__) {
      checkSiteExists(window.__PAB_SITENAME__);
      watchLogin();
    }

    // Analytics + header/footer scripts (overridable via site-scripts-config.json)
    loadScript('/pab-ui/site-scripts.js');

    var SCRIPT = '/pab-ui/asset-comments-v4.js';
    if (!customElements.get('pab-asset-comments')) {
      loadScript(SCRIPT, function () {
        window.__PAB_UI_LOADED__ = !!customElements.get('pab-asset-comments');
      });
    }
    // Preset cb/rb tag groups under images (site settings.preset_tags)
    if (!customElements.get('pab-asset-preset-tags')) {
      loadScript('/pab-ui/asset-preset-tags.js');
    }
    // Nav for Abbot / Site settings is registered via Immich web extensions
    // (pabimmich/web/src/lib/extensions/pab/site-settings.extension.ts) and in-app
    // routes /abbot + /site-settings — not DOM injection. Static pages under
    // /pab-ui/*.html remain as fallback deep links only.
  } catch (e) {
    console.warn('[pab-ui] boot error', e);
  }
})();

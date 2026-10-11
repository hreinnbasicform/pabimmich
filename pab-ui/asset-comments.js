/**
 * External PAB asset comments — custom element `pab-asset-comments`.
 * Served from /pab-ui/ (outside the Immich image). Update this file without docker rebuild.
 *
 * Auth is automatic: Immich cookie → GET /pab-api/web-auth → short-lived PAB web token.
 * No manual localStorage passport.
 *
 * Attributes:
 *   asset-id  Immich asset UUID (maps via PAB GET /photos/by-engine-asset/:id)
 *   is-owner  present when viewer owns the asset (optional)
 */
(function () {
  const TAG = 'pab-asset-comments';
  if (customElements.get(TAG)) return;

  const LS = {
    base: 'pab_api_base',
    tenant: 'pab_tenant',
    passport: 'pab_passport',
    webExp: 'pab_web_exp',
  };

  let authPromise = null;

  /** Never keep a custom port (:8100 etc.). Relative paths unchanged. */
  function stripPort(base) {
    if (!base) return base;
    if (base.startsWith('/')) return base.replace(/\/$/, '') || '/';
    try {
      const u = new URL(base, location.origin);
      u.port = '';
      return u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, ''));
    } catch {
      return String(base).replace(/:\d+(?=\/|$)/, '').replace(/\/$/, '');
    }
  }

  function tenantFromHost() {
    const parts = (location.hostname || '').toLowerCase().split('.').filter(Boolean);
    if (parts.length < 3) return '';
    const sub = parts[0];
    if (['www', 'api', 'padmin', 'admin', 'app'].includes(sub)) return '';
    return sub;
  }

  /** Same-origin /pab-api on site hosts (nginx → orchestrator). Never :8100. */
  function defaultApiBase() {
    if (tenantFromHost()) return location.origin + '/pab-api';
    return stripPort(location.origin);
  }

  function baseConfig() {
    let apiBase = stripPort(
      (localStorage.getItem(LS.base) || window.__PAB_API_BASE__ || defaultApiBase() || '').replace(
        /\/$/,
        '',
      ),
    );
    if (/:8100\b/.test(localStorage.getItem(LS.base) || '')) {
      apiBase = defaultApiBase();
      try {
        localStorage.setItem(LS.base, apiBase);
      } catch (_) {}
    }
    const tenant =
      localStorage.getItem(LS.tenant) || window.__PAB_SITENAME__ || tenantFromHost() || '';
    return { apiBase, tenant };
  }

  function tokenStillValid() {
    try {
      const tok = localStorage.getItem(LS.passport) || '';
      if (!tok.startsWith('pabw.')) return !!tok; // long-lived site passport ok if present
      const exp = parseInt(localStorage.getItem(LS.webExp) || '0', 10);
      return exp > Date.now() / 1000 + 60; // 1 min skew
    } catch {
      return false;
    }
  }

  /**
   * Ensure we have a PAB auth token. Uses Immich session cookie automatically.
   * @returns {Promise<{ok:true,apiBase,tenant,passport}|{ok:false,...}>}
   */
  async function ensureAuth() {
    if (authPromise) return authPromise;
    authPromise = (async () => {
      try {
        const { apiBase, tenant } = baseConfig();
        if (!apiBase || !tenant) {
          return { ok: false, apiBase, tenant, needSignIn: false, missingTenant: !tenant };
        }
        if (tokenStillValid()) {
          const passport = localStorage.getItem(LS.passport) || window.__PAB_PASSPORT__ || '';
          if (passport) return { ok: true, apiBase, tenant, passport };
        }

        // Exchange Immich cookie for short-lived PAB web token (same origin, credentials)
        const res = await fetch(`${apiBase}/web-auth`, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json', 'X-Tenant': tenant },
          cache: 'no-store',
        });
        const text = await res.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
        if (!res.ok) {
          const needSignIn = res.status === 401;
          return {
            ok: false,
            apiBase,
            tenant,
            needSignIn,
            error: (data && data.error) || `web-auth HTTP ${res.status}`,
          };
        }
        if (!data || !data.token) {
          return { ok: false, apiBase, tenant, error: 'web-auth missing token' };
        }
        try {
          localStorage.setItem(LS.passport, data.token);
          if (data.expires_at) {
            localStorage.setItem(LS.webExp, String(Math.floor(new Date(data.expires_at).getTime() / 1000)));
          }
          if (data.tenant) localStorage.setItem(LS.tenant, data.tenant);
        } catch (_) {}
        return { ok: true, apiBase, tenant: data.tenant || tenant, passport: data.token };
      } catch (e) {
        return { ok: false, error: e.message || 'web-auth failed', needSignIn: true };
      } finally {
        authPromise = null;
      }
    })();
    return authPromise;
  }

  /** Sync snapshot for render (may be incomplete until ensureAuth). */
  function getConfig() {
    try {
      const { apiBase, tenant } = baseConfig();
      const passport = localStorage.getItem(LS.passport) || window.__PAB_PASSPORT__ || '';
      if (!apiBase || !tenant || !passport || !tokenStillValid()) {
        return {
          ok: false,
          apiBase,
          tenant,
          passport,
          missingPassport: !passport || !tokenStillValid(),
          missingTenant: !tenant,
        };
      }
      return { ok: true, apiBase, tenant, passport };
    } catch {
      return { ok: false, missingPassport: true };
    }
  }

  async function pabFetch(path, init = {}) {
    let cfg = await ensureAuth();
    if (!cfg.ok) {
      const err = new Error(
        cfg.needSignIn
          ? 'Sign in to the photo UI to comment'
          : cfg.error || 'PAB auth failed',
      );
      err.code = 'UNCONFIGURED';
      err.cfg = cfg;
      throw err;
    }
    const url = path.startsWith('http')
      ? stripPort(path)
      : `${cfg.apiBase}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = new Headers(init.headers || {});
    headers.set('X-Tenant', cfg.tenant);
    headers.set('X-Auth-Key', cfg.passport);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    let res = await fetch(url, { ...init, headers, credentials: 'same-origin' });
    // Retry once on 403 with fresh web-auth (expired token)
    if (res.status === 403 || res.status === 401) {
      try {
        localStorage.removeItem(LS.passport);
        localStorage.removeItem(LS.webExp);
      } catch (_) {}
      cfg = await ensureAuth();
      if (cfg.ok) {
        headers.set('X-Auth-Key', cfg.passport);
        headers.set('X-Tenant', cfg.tenant);
        res = await fetch(url, { ...init, headers, credentials: 'same-origin' });
      }
    }
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const msg =
        data && typeof data === 'object' && data.error ? String(data.error) : `PAB HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  function authorLabel(c) {
    const a = c.author || {};
    return a.display_name || a.email || (a.user_id != null ? `user ${a.user_id}` : 'Someone');
  }

  function formatWhen(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso || '';
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso || '';
    }
  }

  const css = `
    :host { display: block; font-size: 14px; color: inherit; }
    .wrap {
      border-top: 1px solid rgba(128,128,128,.35);
      background: rgba(255,255,255,.95);
      padding: 12px;
      backdrop-filter: blur(6px);
    }
    @media (prefers-color-scheme: dark) {
      .wrap { background: rgba(20,20,24,.95); }
    }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; opacity: .75; font-size: 12px; }
    .msg { font-size: 12px; opacity: .75; margin: 0 0 8px; }
    .err { color: #dc2626; font-size: 12px; margin: 0 0 8px; }
    ul { list-style: none; margin: 0 0 12px; padding: 0; max-height: 9rem; overflow-y: auto; }
    li {
      display: flex; gap: 8px; justify-content: space-between; align-items: flex-start;
      border: 1px solid rgba(128,128,128,.3); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px;
      background: rgba(0,0,0,.03);
    }
    .meta { font-size: 11px; opacity: .55; margin-left: 6px; }
    .author { font-weight: 600; color: #4250af; }
    .body { margin: 2px 0 0; word-break: break-word; }
    form { display: flex; gap: 8px; align-items: flex-end; }
    label { flex: 1; min-width: 0; font-size: 12px; }
    label span { display: block; opacity: .7; margin-bottom: 4px; }
    input {
      width: 100%; box-sizing: border-box; border-radius: 6px; border: 1px solid rgba(128,128,128,.45);
      padding: 6px 8px; background: transparent; color: inherit; font: inherit;
    }
    button {
      border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer;
      background: #4250af; color: #fff; font: inherit; font-size: 13px;
    }
    button:disabled { opacity: .45; cursor: not-allowed; }
    button.ghost { background: transparent; color: inherit; opacity: .6; padding: 2px 6px; font-size: 12px; }
    code { font-size: 11px; }
  `;

  class PabAssetComments extends HTMLElement {
    static get observedAttributes() {
      return ['asset-id'];
    }

    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
      this._state = {
        status: 'idle',
        comments: [],
        photoHash: null,
        error: null,
        draft: '',
        busy: false,
      };
      this._bound = false;
    }

    connectedCallback() {
      this._render();
      this._load();
    }

    attributeChangedCallback(name, oldV, newV) {
      if (name === 'asset-id' && oldV !== newV && this.isConnected) {
        this._load();
      }
    }

    get assetId() {
      return this.getAttribute('asset-id') || '';
    }

    async _load() {
      const assetId = this.assetId;
      if (!assetId) return;
      this._state = { ...this._state, status: 'loading', error: null, comments: [], photoHash: null };
      this._render();

      const auth = await ensureAuth();
      if (!auth.ok) {
        this._state = {
          ...this._state,
          status: 'unconfigured',
          comments: [],
          photoHash: null,
          error: auth.error || null,
          cfg: auth,
        };
        this._render();
        return;
      }

      try {
        const meta = await pabFetch(`/photos/by-engine-asset/${encodeURIComponent(assetId)}`);
        const photoHash = meta.photo_hash;
        const list = await pabFetch(`/photos/${encodeURIComponent(photoHash)}/comments?page=1&per_page=100`);
        this._state = {
          ...this._state,
          status: 'ready',
          photoHash,
          comments: list.comments || [],
          error: null,
        };
      } catch (e) {
        if (e && e.status === 404) {
          this._state = {
            ...this._state,
            status: 'unlinked',
            error: 'This Immich asset is not linked to a PAB photo (upload via PAB API sets engine_asset_id).',
          };
        } else if (e && e.code === 'UNCONFIGURED') {
          this._state = { ...this._state, status: 'unconfigured', error: e.message, cfg: e.cfg };
        } else {
          this._state = {
            ...this._state,
            status: 'error',
            error: e && e.message ? e.message : 'Failed to load comments',
          };
        }
      }
      this._render();
    }

    async _post() {
      const text = (this._state.draft || '').trim();
      if (!text || !this._state.photoHash || this._state.busy) return;
      this._state.busy = true;
      this._state.error = null;
      this._render();
      try {
        const created = await pabFetch(`/photos/${encodeURIComponent(this._state.photoHash)}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body: text }),
        });
        const row = {
          id: Number(created.id),
          body: created.body,
          created_at: created.created_at,
          author: created.author || {
            user_id: created.author_user_id ?? null,
            email: null,
            display_name: 'You',
          },
        };
        this._state.comments = [...this._state.comments, row];
        this._state.draft = '';
      } catch (e) {
        this._state.error = e && e.message ? e.message : 'Failed to post';
      }
      this._state.busy = false;
      this._render();
    }

    async _del(id) {
      if (!this._state.photoHash || this._state.busy) return;
      this._state.busy = true;
      this._state.error = null;
      this._render();
      try {
        await pabFetch(`/photos/${encodeURIComponent(this._state.photoHash)}/comments/${id}`, {
          method: 'DELETE',
        });
        this._state.comments = this._state.comments.filter((c) => c.id !== id);
      } catch (e) {
        this._state.error = e && e.message ? e.message : 'Failed to delete';
      }
      this._state.busy = false;
      this._render();
    }

    _render() {
      const s = this._state;
      const root = this._root;
      root.innerHTML = '';
      const style = document.createElement('style');
      style.textContent = css;
      root.appendChild(style);

      const wrap = document.createElement('div');
      wrap.className = 'wrap';

      const head = document.createElement('div');
      head.className = 'head';
      head.innerHTML = `<span>Comments</span><span>${s.status === 'ready' ? s.comments.length : s.status === 'loading' ? '…' : ''}</span>`;
      wrap.appendChild(head);

      if (s.status === 'unconfigured') {
        const p = document.createElement('p');
        p.className = 'msg';
        const cfg = s.cfg || {};
        if (cfg.needSignIn) {
          p.textContent = 'Sign in to the photo library to load and post comments.';
        } else {
          p.textContent = cfg.error || 'Could not link this browser session to PAB. Sign in again.';
        }
        wrap.appendChild(p);
        root.appendChild(wrap);
        return;
      }
      if (s.status === 'loading') {
        const p = document.createElement('p');
        p.className = 'msg';
        p.textContent = 'Loading comments…';
        wrap.appendChild(p);
        root.appendChild(wrap);
        return;
      }
      if (s.status === 'unlinked' || s.status === 'error') {
        const p = document.createElement('p');
        p.className = s.status === 'error' ? 'err' : 'msg';
        p.textContent = s.error || 'Unavailable';
        wrap.appendChild(p);
        if (s.status === 'error') {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'Retry';
          btn.className = 'ghost';
          btn.onclick = () => this._load();
          wrap.appendChild(btn);
        }
        root.appendChild(wrap);
        return;
      }

      if (s.error) {
        const p = document.createElement('p');
        p.className = 'err';
        p.textContent = s.error;
        wrap.appendChild(p);
      }

      const ul = document.createElement('ul');
      if (!s.comments.length) {
        const li = document.createElement('li');
        li.style.border = 'none';
        li.style.background = 'transparent';
        li.innerHTML = '<span class="msg">No comments yet — add one below.</span>';
        ul.appendChild(li);
      } else {
        for (const c of s.comments) {
          const li = document.createElement('li');
          const left = document.createElement('div');
          left.innerHTML = `<div><span class="author"></span><span class="meta"></span></div><p class="body"></p>`;
          left.querySelector('.author').textContent = authorLabel(c);
          left.querySelector('.meta').textContent = formatWhen(c.created_at);
          left.querySelector('.body').textContent = c.body;
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'ghost';
          del.textContent = '✕';
          del.title = 'Delete';
          del.disabled = s.busy;
          del.onclick = () => this._del(c.id);
          li.appendChild(left);
          li.appendChild(del);
          ul.appendChild(li);
        }
      }
      wrap.appendChild(ul);

      const form = document.createElement('form');
      const label = document.createElement('label');
      const labelSpan = document.createElement('span');
      labelSpan.textContent = 'Add a comment';
      label.appendChild(labelSpan);
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 4000;
      input.placeholder = 'Write something…';
      input.value = s.draft;
      input.disabled = s.busy || !s.photoHash;
      input.autocomplete = 'off';
      label.appendChild(input);
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.textContent = 'Add';
      const syncSubmit = () => {
        this._state.draft = input.value;
        const canSend = !s.busy && !!s.photoHash && !!(input.value || '').trim();
        submit.disabled = !canSend;
      };
      syncSubmit();
      // Must re-enable Add as the user types (was stuck disabled after first render)
      input.addEventListener('input', syncSubmit);
      input.addEventListener('change', syncSubmit);
      form.appendChild(label);
      form.appendChild(submit);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this._state.draft = input.value;
        if (!(this._state.draft || '').trim() || !this._state.photoHash || this._state.busy) return;
        void this._post();
      });
      wrap.appendChild(form);

      root.appendChild(wrap);
    }
  }

  customElements.define(TAG, PabAssetComments);
  console.info('[pab-ui] registered', TAG);
})();

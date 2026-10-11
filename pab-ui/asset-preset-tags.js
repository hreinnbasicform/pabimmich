/**
 * Preset tag groups under every asset image (Immich web).
 * Custom element: pab-asset-preset-tags
 *
 * Loads formulas from GET /site/preset-tags (site settings.preset_tags).
 * Formulas: cb[group,a,b] = checkboxes; rb[group,x,y] = radio.
 * Selected → PAB tags: catlink:<group>:<option> via POST /photos/bulk tag|untag.
 */
(function () {
  const TAG = 'pab-asset-preset-tags';
  if (customElements.get(TAG)) return;

  const LS = {
    base: 'pab_api_base',
    tenant: 'pab_tenant',
    passport: 'pab_passport',
    webExp: 'pab_web_exp',
  };

  let authPromise = null;

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
    const tenant =
      localStorage.getItem(LS.tenant) || window.__PAB_SITENAME__ || tenantFromHost() || '';
    return { apiBase, tenant };
  }

  function tokenStillValid() {
    try {
      const tok = localStorage.getItem(LS.passport) || '';
      if (!tok.startsWith('pabw.')) return !!tok;
      const exp = parseInt(localStorage.getItem(LS.webExp) || '0', 10);
      return exp > Date.now() / 1000 + 60;
    } catch {
      return false;
    }
  }

  async function ensureAuth() {
    if (authPromise) return authPromise;
    authPromise = (async () => {
      try {
        const { apiBase, tenant } = baseConfig();
        if (!apiBase || !tenant) {
          return { ok: false, apiBase, tenant };
        }
        if (tokenStillValid()) {
          const passport = localStorage.getItem(LS.passport) || window.__PAB_PASSPORT__ || '';
          if (passport) return { ok: true, apiBase, tenant, passport };
        }
        const res = await fetch(`${apiBase}/web-auth`, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json', 'X-Tenant': tenant },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || !data.token) {
          return { ok: false, apiBase, tenant, needSignIn: res.status === 401 };
        }
        try {
          localStorage.setItem(LS.passport, data.token);
          if (data.expires_at) {
            localStorage.setItem(
              LS.webExp,
              String(Math.floor(new Date(data.expires_at).getTime() / 1000)),
            );
          }
        } catch (_) {}
        return { ok: true, apiBase, tenant: data.tenant || tenant, passport: data.token };
      } catch (e) {
        return { ok: false, error: e.message };
      } finally {
        authPromise = null;
      }
    })();
    return authPromise;
  }

  async function pabFetch(path, init = {}) {
    let cfg = await ensureAuth();
    if (!cfg.ok) {
      const err = new Error(cfg.needSignIn ? 'Sign in to set tags' : cfg.error || 'PAB auth failed');
      err.code = 'UNCONFIGURED';
      throw err;
    }
    const url = `${cfg.apiBase}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = new Headers(init.headers || {});
    headers.set('X-Tenant', cfg.tenant);
    headers.set('X-Auth-Key', cfg.passport);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    let res = await fetch(url, { ...init, headers, credentials: 'same-origin' });
    if (res.status === 401 || res.status === 403) {
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
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const err = new Error(
        (data && data.error) || `PAB HTTP ${res.status}`,
      );
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function tagKey(group, option) {
    return `catlink:${group}:${option}`;
  }

  function hasTag(tags, group, option) {
    const want = tagKey(group, option).toLowerCase();
    return (tags || []).some((t) => String(t).toLowerCase() === want);
  }

  const css = `
    :host { display: block; font-size: 13px; color: inherit; position: relative; z-index: 2; }
    .wrap {
      border-top: 1px solid rgba(128,128,128,.3);
      background: rgba(255,255,255,.97);
      padding: 10px 12px 8px;
      backdrop-filter: blur(6px);
    }
    @media (prefers-color-scheme: dark) {
      .wrap { background: rgba(20,20,24,.97); }
    }
    .title { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; opacity: .65; margin: 0 0 8px; }
    .group { margin-bottom: 10px; }
    .group:last-child { margin-bottom: 0; }
    .gname { font-weight: 700; font-size: 12px; margin-bottom: 6px; opacity: .9; }
    .opts { display: flex; flex-wrap: wrap; gap: 6px; }
    label.chip {
      display: inline-flex; align-items: center; gap: 5px;
      border: 1px solid rgba(128,128,128,.4); border-radius: 999px;
      padding: 4px 10px; cursor: pointer; user-select: none;
      background: rgba(0,0,0,.03); font-size: 12px;
    }
    label.chip.on {
      border-color: #4250af; background: rgba(66,80,175,.15); font-weight: 600;
    }
    label.chip input { margin: 0; accent-color: #4250af; }
    label.chip.busy { opacity: .5; pointer-events: none; }
    .msg { font-size: 11px; opacity: .65; margin: 0; }
    .err { color: #dc2626; font-size: 11px; margin: 4px 0 0; }
  `;

  class PabAssetPresetTags extends HTMLElement {
    static get observedAttributes() {
      return ['asset-id'];
    }

    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
      this._state = {
        status: 'idle',
        groups: [],
        tags: [],
        photoHash: null,
        busyKey: null,
        error: null,
      };
      this._stopImmichKeys = (e) => {
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      };
    }

    connectedCallback() {
      for (const ev of ['keydown', 'keyup', 'keypress']) {
        this.addEventListener(ev, this._stopImmichKeys, true);
      }
      this._render();
      this._load();
    }

    disconnectedCallback() {
      for (const ev of ['keydown', 'keyup', 'keypress']) {
        this.removeEventListener(ev, this._stopImmichKeys, true);
      }
    }

    attributeChangedCallback(name, oldV, newV) {
      if (name === 'asset-id' && oldV !== newV && this.isConnected) this._load();
    }

    get assetId() {
      return this.getAttribute('asset-id') || '';
    }

    async _load() {
      const assetId = this.assetId;
      if (!assetId) return;
      this._state = { ...this._state, status: 'loading', error: null };
      this._render();
      try {
        const preset = await pabFetch('/site/preset-tags');
        const groups = preset.groups || [];
        if (!groups.length) {
          this._state = { ...this._state, status: 'empty', groups: [], photoHash: null };
          this._render();
          return;
        }
        const meta = await pabFetch(`/photos/by-engine-asset/${encodeURIComponent(assetId)}`);
        const tags = Array.isArray(meta.tags) ? meta.tags.map(String) : [];
        this._state = {
          ...this._state,
          status: 'ready',
          groups,
          tags,
          photoHash: meta.photo_hash,
          error: null,
        };
      } catch (e) {
        if (e && e.status === 404) {
          this._state = {
            ...this._state,
            status: 'unlinked',
            error: 'Photo not linked to PAB yet',
          };
        } else if (e && e.code === 'UNCONFIGURED') {
          this._state = { ...this._state, status: 'hidden', error: null };
        } else {
          this._state = {
            ...this._state,
            status: 'error',
            error: e.message || 'Failed to load presets',
          };
        }
      }
      this._render();
    }

    async _setOption(group, option, on) {
      const s = this._state;
      if (!s.photoHash || s.busyKey) return;
      const key = `${group}:${option}`;
      this._state.busyKey = key;
      this._state.error = null;
      this._render();

      try {
        if (group.type === 'rb' || (typeof group === 'object' && group.type === 'rb')) {
          // radio: untag all options in group, then tag selected
          const g = typeof group === 'object' ? group : { name: group, options: [option], type: 'rb' };
          const toRemove = g.options
            .map((o) => tagKey(g.name, o))
            .filter((t) => (s.tags || []).some((x) => String(x).toLowerCase() === t.toLowerCase()));
          if (toRemove.length) {
            await pabFetch('/photos/bulk', {
              method: 'POST',
              body: JSON.stringify({
                action: 'untag',
                hashes: [s.photoHash],
                tags: toRemove,
              }),
            });
          }
          if (on) {
            await pabFetch('/photos/bulk', {
              method: 'POST',
              body: JSON.stringify({
                action: 'tag',
                hashes: [s.photoHash],
                tags: [tagKey(g.name, option)],
              }),
            });
          }
        } else {
          const gname = typeof group === 'object' ? group.name : group;
          await pabFetch('/photos/bulk', {
            method: 'POST',
            body: JSON.stringify({
              action: on ? 'tag' : 'untag',
              hashes: [s.photoHash],
              tags: [tagKey(gname, option)],
            }),
          });
        }
        // Reload tags from photo
        const meta = await pabFetch(
          `/photos/by-engine-asset/${encodeURIComponent(this.assetId)}`,
        );
        this._state.tags = Array.isArray(meta.tags) ? meta.tags.map(String) : [];
      } catch (e) {
        this._state.error = e.message || 'Failed to update tags';
      }
      this._state.busyKey = null;
      this._render();
    }

    _render() {
      const s = this._state;
      const root = this._root;
      root.innerHTML = '';
      if (s.status === 'empty' || s.status === 'hidden' || s.status === 'idle') {
        this.style.display = 'none';
        return;
      }
      this.style.display = '';

      const style = document.createElement('style');
      style.textContent = css;
      root.appendChild(style);

      const wrap = document.createElement('div');
      wrap.className = 'wrap';
      for (const ev of ['keydown', 'keyup', 'keypress']) {
        wrap.addEventListener(ev, this._stopImmichKeys, true);
      }

      if (s.status === 'loading') {
        const p = document.createElement('p');
        p.className = 'msg';
        p.textContent = 'Loading tags…';
        wrap.appendChild(p);
        root.appendChild(wrap);
        return;
      }
      if (s.status === 'unlinked' || s.status === 'error') {
        // Soft-hide unlinked so unlinked assets stay clean; show error only on real errors
        if (s.status === 'error') {
          const p = document.createElement('p');
          p.className = 'err';
          p.textContent = s.error || 'Error';
          wrap.appendChild(p);
          root.appendChild(wrap);
        } else {
          this.style.display = 'none';
        }
        return;
      }

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = 'Quick tags';
      wrap.appendChild(title);

      if (s.error) {
        const p = document.createElement('p');
        p.className = 'err';
        p.textContent = s.error;
        wrap.appendChild(p);
      }

      for (const g of s.groups) {
        const box = document.createElement('div');
        box.className = 'group';
        const gn = document.createElement('div');
        gn.className = 'gname';
        gn.textContent = g.name;
        box.appendChild(gn);
        const opts = document.createElement('div');
        opts.className = 'opts';
        for (const opt of g.options) {
          const lab = document.createElement('label');
          lab.className = 'chip';
          const on = hasTag(s.tags, g.name, opt);
          if (on) lab.classList.add('on');
          const busy = s.busyKey === `${g.name}:${opt}` || s.busyKey === `rb:${g.name}`;
          if (busy || s.busyKey) lab.classList.add('busy');
          const input = document.createElement('input');
          input.type = g.type === 'rb' ? 'radio' : 'checkbox';
          input.name = `pab-preset-${g.name}`;
          input.checked = on;
          input.disabled = !!s.busyKey;
          input.onchange = () => {
            if (g.type === 'rb') {
              void this._setOption(g, opt, true);
            } else {
              void this._setOption(g, opt, input.checked);
            }
          };
          const span = document.createElement('span');
          span.textContent = opt;
          lab.appendChild(input);
          lab.appendChild(span);
          opts.appendChild(lab);
        }
        box.appendChild(opts);
        wrap.appendChild(box);
      }

      root.appendChild(wrap);
    }
  }

  customElements.define(TAG, PabAssetPresetTags);
  console.info('[pab-ui] registered', TAG);

  /** Auto-inject above pab-asset-comments (no Immich rebuild). */
  function injectAll() {
    const comments = document.querySelectorAll('pab-asset-comments');
    comments.forEach((el) => {
      const aid = el.getAttribute('asset-id') || '';
      let prev = el.previousElementSibling;
      if (prev && prev.tagName === 'PAB-ASSET-PRESET-TAGS') {
        if (aid) prev.setAttribute('asset-id', aid);
        return;
      }
      const pt = document.createElement(TAG);
      if (aid) pt.setAttribute('asset-id', aid);
      if (el.parentNode) el.parentNode.insertBefore(pt, el);
    });
    // Also mount if extension host exists without comments
    document.querySelectorAll('[data-testid="pab-asset-comments"]').forEach((el) => {
      if (el.tagName === 'PAB-ASSET-COMMENTS') return;
      // loading placeholder — wait
    });
  }

  const mo = new MutationObserver(() => injectAll());
  if (document.documentElement) {
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectAll);
  } else {
    injectAll();
  }
  setInterval(injectAll, 1500);
})();

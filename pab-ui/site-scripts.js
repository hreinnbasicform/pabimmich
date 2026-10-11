/**
 * PAB site scripts extension (host-mounted).
 *
 * Default: Google gtag G-Q0R7L2RJKH in the document header.
 * Overridable without Immich rebuild:
 *   1) window.__PAB_SITE_SCRIPTS_OVERRIDE__  (object, highest priority)
 *   2) /pab-ui/site-scripts-config.json     (this folder on the host)
 *   3) built-in defaults
 *
 * Public API (after load):
 *   window.PabSiteScripts.configure({ gtagId, header, footer, enabled })
 *   window.PabSiteScripts.setHeader([...])
 *   window.PabSiteScripts.setFooter([...])
 *   window.PabSiteScripts.setGtagId('G-…' | null)
 *   window.PabSiteScripts.apply()
 *   window.PabSiteScripts.getConfig()
 *
 * Slot item shapes:
 *   { id: 'x', src: 'https://…', async?: true, defer?: true }
 *   { id: 'y', html: '<script>…</script>' | raw markup }
 *   { id: 'gtag', type: 'gtag', gtagId?: 'G-…' }
 */
(function () {
  'use strict';

  var ATTR = 'data-pab-site-script';
  var DEFAULT_GTAG = 'G-Q0R7L2RJKH';
  var CONFIG_URL = '/pab-ui/site-scripts-config.json';

  var state = {
    enabled: true,
    gtagId: DEFAULT_GTAG,
    header: /** @type {any[]} */ ([]),
    footer: /** @type {any[]} */ ([]),
    loaded: false,
  };

  function deepClone(o) {
    try {
      return JSON.parse(JSON.stringify(o));
    } catch (_) {
      return o;
    }
  }

  function defaults() {
    return {
      enabled: true,
      gtagId: DEFAULT_GTAG,
      header: [{ id: 'gtag', type: 'gtag' }],
      footer: [],
    };
  }

  function mergeConfig(base, over) {
    if (!over || typeof over !== 'object') return base;
    var out = deepClone(base);
    if (over.enabled === false) out.enabled = false;
    if (over.enabled === true) out.enabled = true;
    if (over.gtagId !== undefined) out.gtagId = over.gtagId;
    if (Array.isArray(over.header)) out.header = over.header.slice();
    if (Array.isArray(over.footer)) out.footer = over.footer.slice();
    // replaceHeader/replaceFooter aliases
    if (Array.isArray(over.replaceHeader)) out.header = over.replaceHeader.slice();
    if (Array.isArray(over.replaceFooter)) out.footer = over.replaceFooter.slice();
    // append helpers
    if (Array.isArray(over.appendHeader)) {
      out.header = (out.header || []).concat(over.appendHeader);
    }
    if (Array.isArray(over.appendFooter)) {
      out.footer = (out.footer || []).concat(over.appendFooter);
    }
    return out;
  }

  function removeInjected() {
    if (typeof document === 'undefined') return;
    var nodes = document.querySelectorAll('[' + ATTR + ']');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].parentNode && nodes[i].parentNode.removeChild(nodes[i]);
    }
  }

  function mark(el, id, slot) {
    el.setAttribute(ATTR, id || 'anon');
    el.setAttribute(ATTR + '-slot', slot || 'header');
    return el;
  }

  function injectSrc(parent, item, slot) {
    if (!item || !item.src) return;
    var id = String(item.id || item.src);
    if (document.querySelector('[' + ATTR + '="' + id.replace(/"/g, '') + '"]')) return;
    var s = document.createElement('script');
    s.src = item.src;
    if (item.async !== false) s.async = true;
    if (item.defer) s.defer = true;
    if (item.type) s.type = item.type;
    mark(s, id, slot);
    parent.appendChild(s);
  }

  function injectHtml(parent, item, slot) {
    if (!item || item.html == null) return;
    var id = String(item.id || 'html');
    var wrap = document.createElement('div');
    wrap.innerHTML = String(item.html);
    // Move children (scripts need special handling to execute)
    while (wrap.firstChild) {
      var node = wrap.firstChild;
      wrap.removeChild(node);
      if (node.nodeName === 'SCRIPT') {
        var s = document.createElement('script');
        if (node.src) s.src = node.src;
        else s.text = node.textContent || '';
        if (node.type) s.type = node.type;
        if (node.async) s.async = true;
        mark(s, id, slot);
        parent.appendChild(s);
      } else {
        if (node.nodeType === 1) mark(node, id, slot);
        parent.appendChild(node);
      }
    }
  }

  function injectGtag(parent, gtagId, slot) {
    if (!gtagId) return;
    var id = 'gtag';
    if (document.querySelector('script[src*="googletagmanager.com/gtag/js?id=' + gtagId + '"]')) {
      // still ensure config if only loader present
    }
    if (document.querySelector('[' + ATTR + '="' + id + '-loader"]')) return;

    var loader = document.createElement('script');
    loader.async = true;
    loader.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gtagId);
    mark(loader, id + '-loader', slot);
    parent.appendChild(loader);

    var cfg = document.createElement('script');
    cfg.text =
      "window.dataLayer = window.dataLayer || [];\n" +
      "function gtag(){dataLayer.push(arguments);}\n" +
      "gtag('js', new Date());\n" +
      "gtag('config', " +
      JSON.stringify(gtagId) +
      ');';
    mark(cfg, id + '-config', slot);
    parent.appendChild(cfg);
  }

  function processItem(parent, item, slot, gtagId) {
    if (!item || typeof item !== 'object') return;
    if (item.enabled === false) return;
    var t = String(item.type || '').toLowerCase();
    if (t === 'gtag' || item.id === 'gtag') {
      injectGtag(parent, item.gtagId || gtagId || DEFAULT_GTAG, slot);
      return;
    }
    if (item.src) {
      injectSrc(parent, item, slot);
      return;
    }
    if (item.html != null) {
      injectHtml(parent, item, slot);
    }
  }

  function ensureFooterHost() {
    var el = document.getElementById('pab-site-scripts-footer');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pab-site-scripts-footer';
    el.setAttribute(ATTR, 'footer-host');
    el.setAttribute(ATTR + '-slot', 'footer');
    el.style.cssText = 'display:contents';
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function apply() {
    if (typeof document === 'undefined') return;
    if (!state.enabled) {
      removeInjected();
      return;
    }
    removeInjected();

    var head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;

    var headerItems = state.header && state.header.length
      ? state.header
      : state.gtagId
        ? [{ id: 'gtag', type: 'gtag' }]
        : [];

    // If gtagId set and header has no gtag entry, prepend default gtag
    var hasGtag = headerItems.some(function (it) {
      return it && (it.type === 'gtag' || it.id === 'gtag');
    });
    if (state.gtagId && !hasGtag) {
      headerItems = [{ id: 'gtag', type: 'gtag' }].concat(headerItems);
    }
    if (!state.gtagId) {
      headerItems = headerItems.filter(function (it) {
        return !(it && (it.type === 'gtag' || it.id === 'gtag'));
      });
    }

    for (var i = 0; i < headerItems.length; i++) {
      processItem(head, headerItems[i], 'header', state.gtagId);
    }

    var foot = state.footer || [];
    if (foot.length) {
      var host = ensureFooterHost();
      for (var j = 0; j < foot.length; j++) {
        processItem(host, foot[j], 'footer', state.gtagId);
      }
    }
    state.loaded = true;
  }

  function setStateFromConfig(cfg) {
    if (!cfg) return;
    if (cfg.enabled === false) state.enabled = false;
    if (cfg.enabled === true) state.enabled = true;
    if (cfg.gtagId !== undefined) state.gtagId = cfg.gtagId;
    if (Array.isArray(cfg.header)) state.header = cfg.header.slice();
    if (Array.isArray(cfg.footer)) state.footer = cfg.footer.slice();
  }

  function loadAndApply() {
    var base = defaults();
    // Runtime override object (set early in page, highest priority after merge of file)
    var early = typeof window !== 'undefined' ? window.__PAB_SITE_SCRIPTS_OVERRIDE__ : null;

    function finish(fileCfg) {
      var merged = mergeConfig(base, fileCfg || {});
      merged = mergeConfig(merged, early || {});
      setStateFromConfig(merged);
      // Ensure default gtag in header list if empty and gtagId set
      if ((!merged.header || !merged.header.length) && merged.gtagId) {
        state.header = [{ id: 'gtag', type: 'gtag' }];
      }
      apply();
    }

    if (typeof fetch !== 'function') {
      finish(null);
      return;
    }
    fetch(CONFIG_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('config ' + r.status);
        return r.json();
      })
      .then(function (j) {
        finish(j);
      })
      .catch(function () {
        finish(null);
      });
  }

  var api = {
    DEFAULT_GTAG: DEFAULT_GTAG,
    configure: function (partial) {
      setStateFromConfig(mergeConfig(state, partial || {}));
      apply();
      return api;
    },
    setHeader: function (items) {
      state.header = Array.isArray(items) ? items.slice() : [];
      apply();
      return api;
    },
    setFooter: function (items) {
      state.footer = Array.isArray(items) ? items.slice() : [];
      apply();
      return api;
    },
    appendHeader: function (item) {
      state.header = (state.header || []).concat([item]);
      apply();
      return api;
    },
    appendFooter: function (item) {
      state.footer = (state.footer || []).concat([item]);
      apply();
      return api;
    },
    setGtagId: function (id) {
      state.gtagId = id || null;
      apply();
      return api;
    },
    apply: apply,
    reload: loadAndApply,
    getConfig: function () {
      return deepClone({
        enabled: state.enabled,
        gtagId: state.gtagId,
        header: state.header,
        footer: state.footer,
        loaded: state.loaded,
      });
    },
  };

  if (typeof window !== 'undefined') {
    window.PabSiteScripts = api;
  }

  // ── Theme logo / favicon (logo_style light|dark, default white for dark UI) ──
  var THEME_CFG_URLS = ['/pab-ui/theme-branding.json', '/theme-branding.json'];
  var themeCfg = null;
  var lastThemeKey = null;

  function themeIsDark() {
    try {
      var html = document.documentElement;
      if (html.classList.contains('dark')) return true;
      if (html.classList.contains('light')) return false;
      if (html.getAttribute('data-theme') === 'dark') return true;
      if (html.getAttribute('data-theme') === 'light') return false;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) {
      return true; // default dark → white logo
    }
  }

  function applyThemeBranding(cfg) {
    if (!cfg || typeof document === 'undefined') return;
    var follow = cfg.follow_theme !== false;
    var style = follow ? (themeIsDark() ? 'dark' : 'light') : String(cfg.logo_style || 'dark').toLowerCase();
    if (style !== 'light') style = 'dark';
    var key = style + '|' + (follow ? 'auto' : 'fixed');
    if (key === lastThemeKey) return;
    lastThemeKey = key;
    var assets = (cfg.styles && cfg.styles[style]) || (cfg.styles && cfg.styles.dark) || {};
    // Favicon always uses white-fill monogram (readable on browser chrome); logos still theme.
    var ico = '/pab-ui/brand/logo-c-aperture-p_white.ico';
    var png = '/pab-ui/brand/logo-c-aperture-p_white.png';
    var logo = assets.logoIcon || assets.logoInline;

    function setLink(rel, href, sizes, type) {
      if (!href) return;
      var sel = 'link[rel="' + rel + '"]' + (sizes ? '[sizes="' + sizes + '"]' : '');
      var el = document.querySelector(sel);
      if (!el) {
        el = document.createElement('link');
        el.rel = rel;
        if (sizes) el.sizes = sizes;
        if (type) el.type = type;
        el.setAttribute('data-pab-theme-brand', '1');
        document.head.appendChild(el);
      }
      el.href = href + (href.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now();
    }
    if (ico) {
      setLink('shortcut icon', ico, null, 'image/x-icon');
      setLink('icon', ico, null, 'image/x-icon');
    }
    if (png) {
      setLink('icon', png, '32x32', 'image/png');
      setLink('apple-touch-icon', png, null, 'image/png');
    }
    // Swap common logo img slots if present
    if (logo) {
      var imgs = document.querySelectorAll(
        'img[src*="pab-logo"], img[src*="logo-c-aperture"], img[alt="Logo"][src*="/brand/"], img[alt="Logo"][src*="/pab-ui/brand/"]'
      );
      for (var i = 0; i < imgs.length; i++) {
        imgs[i].src = logo + (logo.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now();
      }
    }
    // Prefer Immich branding extension API when present
    try {
      if (window.PabThemeBranding && typeof window.PabThemeBranding.apply === 'function') {
        window.PabThemeBranding.apply();
      }
    } catch (_) {}
  }

  function loadThemeBranding() {
    if (typeof fetch !== 'function') return;
    var i = 0;
    function next() {
      if (i >= THEME_CFG_URLS.length) {
        themeCfg = {
          follow_theme: true,
          logo_style: 'dark',
          styles: {
            dark: {
              favicon: '/pab-ui/brand/logo-c-aperture-p_white.ico',
              logoIcon: '/pab-ui/brand/logo-c-aperture-p_white.svg',
              favicons: { ico: '/pab-ui/brand/logo-c-aperture-p_white.ico', png: '/pab-ui/brand/logo-c-aperture-p_white.png' },
            },
            light: {
              favicon: '/pab-ui/brand/logo-c-aperture-p_white.ico',
              logoIcon: '/pab-ui/brand/logo-c-aperture-p_transparent.svg',
              favicons: {
                ico: '/pab-ui/brand/logo-c-aperture-p_white.ico',
                png: '/pab-ui/brand/logo-c-aperture-p_white.png',
              },
            },
          },
        };
        applyThemeBranding(themeCfg);
        return;
      }
      var url = THEME_CFG_URLS[i++];
      fetch(url + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('no');
          return r.json();
        })
        .then(function (j) {
          themeCfg = j;
          applyThemeBranding(themeCfg);
        })
        .catch(next);
    }
    next();
  }

  function watchTheme() {
    if (typeof document === 'undefined') return;
    loadThemeBranding();
    try {
      var obs = new MutationObserver(function () {
        if (themeCfg) applyThemeBranding(themeCfg);
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    } catch (_) {}
    try {
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
          if (themeCfg) applyThemeBranding(themeCfg);
        });
      }
    } catch (_) {}
    // Also poll in case Immich toggles theme without class mutation we care about
    setInterval(function () {
      if (themeCfg) applyThemeBranding(themeCfg);
    }, 800);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        loadAndApply();
        watchTheme();
      });
    } else {
      loadAndApply();
      watchTheme();
    }
  }
})();

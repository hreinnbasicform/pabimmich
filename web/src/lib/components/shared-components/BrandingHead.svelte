<script lang="ts">
  /**
   * Applies `app.branding` favicon overrides to the document head.
   * Restores stock hrefs when branding is cleared. Renders nothing.
   */
  import { activeBranding } from '$lib/extensions/ui-extension-points.svelte';
  import { onDestroy } from 'svelte';

  type FaviconKey = 'shortcut' | 'ico' | '16' | '32' | '48' | '96' | '144' | 'apple';

  const SELECTORS: Record<FaviconKey, string> = {
    shortcut: 'link[rel="shortcut icon"]',
    ico: 'link[rel="icon"][type="image/x-icon"]',
    '16': 'link[rel="icon"][sizes="16x16"]',
    '32': 'link[rel="icon"][sizes="32x32"]',
    '48': 'link[rel="icon"][sizes="48x48"]',
    '96': 'link[rel="icon"][sizes="96x96"]',
    '144': 'link[rel="icon"][sizes="144x144"]',
    apple: 'link[rel="apple-touch-icon"]',
  };

  let originals: Map<FaviconKey, string> | undefined;

  const ensureOriginals = () => {
    if (originals || typeof document === 'undefined') {
      return;
    }
    originals = new Map();
    for (const [key, selector] of Object.entries(SELECTORS) as [FaviconKey, string][]) {
      const el = document.querySelector(selector);
      if (el instanceof HTMLLinkElement) {
        originals.set(key, el.getAttribute('href') ?? el.href);
      }
    }
  };

  const setHref = (key: FaviconKey, href: string | undefined) => {
    if (!href) {
      return;
    }
    const el = document.querySelector(SELECTORS[key]);
    if (el instanceof HTMLLinkElement) {
      el.setAttribute('href', href);
    }
  };

  const restoreAll = () => {
    if (!originals) {
      return;
    }
    for (const [key, href] of originals) {
      const el = document.querySelector(SELECTORS[key]);
      if (el instanceof HTMLLinkElement) {
        el.setAttribute('href', href);
      }
    }
  };

  $effect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    ensureOriginals();

    const branding = activeBranding();
    if (!branding || (!branding.favicon && !branding.favicons)) {
      restoreAll();
      return;
    }

    const { favicon, favicons } = branding;

    // Single favicon: paint every known link so the tab icon updates consistently.
    if (favicon) {
      for (const key of Object.keys(SELECTORS) as FaviconKey[]) {
        setHref(key, favicon);
      }
    }

    if (favicons) {
      setHref('ico', favicons.ico);
      setHref('shortcut', favicons.ico ?? favicon);
      setHref('16', favicons['16']);
      setHref('32', favicons['32']);
      setHref('48', favicons['48']);
      setHref('96', favicons['96']);
      setHref('144', favicons['144']);
      setHref('apple', favicons.apple);
    }
  });

  onDestroy(() => {
    restoreAll();
  });
</script>

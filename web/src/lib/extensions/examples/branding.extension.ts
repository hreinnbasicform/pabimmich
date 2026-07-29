import { setAppBranding } from '$lib/extensions/ui-extension-points.svelte';

/**
 * Demo: shows how an add-on rebrands Immich (logo + favicon).
 *
 * By default this points at the stock static assets so the UI looks unchanged while still
 * exercising the branding code path. Replace the URLs with your own assets in a real add-on.
 *
 * Runtime updates: call `setAppBranding({ id: '…', … })` again with the same id to swap
 * logos/favicon without reloading; call the returned unregister function to restore stock branding.
 */
export function registerBrandingExtension() {
  return setAppBranding({
    id: 'demo-branding',
    // Stock assets — prove the extension wire-up; replace with custom URLs as needed.
    logoIcon: '/favicon-96.png',
    logoInline: '/favicon-144.png',
    logoBackdrop: '/favicon-144.png',
    favicon: '/favicon.ico',
    favicons: {
      ico: '/favicon.ico',
      16: '/favicon-16.png',
      32: '/favicon-32.png',
      48: '/favicon-48.png',
      96: '/favicon-96.png',
      144: '/favicon-144.png',
      apple: '/apple-icon-180.png',
    },
    order: 100,
  });
}

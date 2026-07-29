/**
 * Public entry for UI extension points.
 * Core is inert: nothing registers until an add-on calls `contribute`.
 * Optional demos / product extensions load only when env flags are set.
 */

export {
  activeBranding,
  brandingLogoSrc,
  contribute,
  contributions,
  detailSections,
  setAppBranding,
  type AppBranding,
  type AssetDetailPoint,
  type AssetDetailSection,
  type AssetDetailSectionProps,
  type SidebarNavItem,
  type SidebarRenderContext,
} from './ui-extension-points.svelte';

export { resolveSidebarNav, type ResolvedNavEntry } from './resolve-sidebar-nav';

// --- Optional loaders (off by default; core remains merge-safe) ---

import { registerActivitiesExtension } from './examples/activities.extension';
import { registerAnimalsExtension } from './examples/animals.extension';
import { registerBrandingExtension } from './examples/branding.extension';
import { registerDetailCommentsExtension } from './examples/detail-comments.extension';
import { registerGeofencingExtension } from './examples/geofencing.extension';

// Site-backed activities/ledger (product). Enable with VITE_PAB_EXTENSIONS=true.
if (import.meta.env.VITE_PAB_EXTENSIONS === 'true' || import.meta.env.VITE_UI_EXTENSIONS_DEMO === 'true') {
  registerActivitiesExtension();
}

// Opt-in demos for development. Off by default so the primitive ships inert.
if (import.meta.env.VITE_UI_EXTENSIONS_DEMO === 'true') {
  registerGeofencingExtension();
  registerBrandingExtension();
  registerDetailCommentsExtension();
  registerAnimalsExtension();
}

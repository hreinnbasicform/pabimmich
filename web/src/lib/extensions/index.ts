/**
 * Public entry for UI extension points.
 * Core is inert: nothing registers until an add-on calls `contribute`.
 * Product + optional demos load based on env flags / fork defaults.
 */

export {
  activeBranding,
  activeUserSettingsVisibility,
  brandingLogoSrc,
  contribute,
  contributions,
  detailSections,
  isUserSettingsSectionVisible,
  setAppBranding,
  setUserSettingsVisibility,
  userSettingsSections,
  type AppBranding,
  type AssetDetailPoint,
  type AssetDetailSection,
  type AssetDetailSectionProps,
  type SidebarNavItem,
  type SidebarRenderContext,
  type UserSettingsSection,
  type UserSettingsSectionKey,
  type UserSettingsVisibility,
} from './ui-extension-points.svelte';

export { resolveSidebarNav, type ResolvedNavEntry } from './resolve-sidebar-nav';

// --- Loaders ---

import { registerActivitiesExtension } from './examples/activities.extension';
import { registerAnimalsExtension } from './examples/animals.extension';
import { registerBrandingExtension } from './examples/branding.extension';
import { registerDetailCommentsExtension } from './examples/detail-comments.extension';
import { registerGeofencingExtension } from './examples/geofencing.extension';
import { registerPabBrandingExtension } from './pab/branding.extension';
import { registerCatsExtension } from './pab/cats.extension';
import { registerPabCommentsExtension } from './pab/comments.extension';
import { registerPabSiteScriptsExtension } from './pab/site-scripts.extension';
import { registerPabSiteSettingsExtension } from './pab/site-settings.extension';
import { registerPabUserSettingsExtension } from './pab/user-settings.extension';

// PAB product branding (logo + favicons via AppLogo / BrandingHead). Always on.
registerPabBrandingExtension();

// PAB product: comments under the asset viewer image. Always on.
registerPabCommentsExtension();

// PAB product: Site settings (clear cache, rebuild geofence) + Abbot nav. Always on.
registerPabSiteSettingsExtension();

// PAB product: Account Settings bare-minimum + Site settings link. Always on.
registerPabUserSettingsExtension();

// PAB product: gtag + overridable header/footer scripts via /pab-ui/ (host-mounted).
registerPabSiteScriptsExtension();

// Site-backed activities/ledger (product). Always on for site owners (sidebar → /activities).
// Neighbors never log into Immich; this is operator review of comments/reactions/photos.
registerActivitiesExtension();

// CatLink sites: sidebar "Cats" (tag catalog) instead of face People. No ML.
registerCatsExtension();

// Opt-in demos for development. Off by default so the primitive ships inert
// aside from product branding + comments above.
if (import.meta.env.VITE_UI_EXTENSIONS_DEMO === 'true') {
  registerGeofencingExtension();
  registerBrandingExtension();
  registerDetailCommentsExtension();
  // Generic animals demo (all types) — skip if product Cats already registered
  if (import.meta.env.VITE_CATLINK_CATS !== 'true') {
    registerAnimalsExtension();
  }
}

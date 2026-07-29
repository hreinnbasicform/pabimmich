/**
 * Public entry for UI extension points.
 * Core is inert: nothing registers until an add-on calls `contribute`.
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

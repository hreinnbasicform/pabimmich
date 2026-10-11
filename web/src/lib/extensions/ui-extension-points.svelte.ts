// A tiny, generic registry of UI extension points for the Immich web app.
// Core components expose named "slots"; add-ons contribute typed items to them.
// Inert by default: a slot with no contributions renders nothing / uses stock assets.

import type { AssetResponseDto } from '@immich/sdk';
import type { Component } from 'svelte';

/** A navigation entry an add-on can contribute to the sidebar. */
export interface SidebarNavItem {
  /** Stable unique id (used as the {#each} key and for de-dupe). */
  id: string;
  /** Already-localized label (the contributor owns its i18n; core adds no keys). */
  title: string;
  /** Destination — an in-app route (e.g. '/geofencing') or absolute URL. */
  href: string;
  /** MDI path string (same convention as the existing @mdi/js icons in the sidebar). */
  icon?: string;
  activeIcon?: string;
  /** Lower sorts earlier among the same placement; default 100. */
  order?: number;
  /** Optional gate; item is shown only when this returns true (evaluated at render). */
  when?: () => boolean;

  /** Place after the core/extension item with this id (e.g. 'people'). */
  preferAfter?: string;
  /** Place before the core/extension item with this id. PreferAfter wins if both set. */
  preferBefore?: string;
  /**
   * When preferAfter/preferBefore target is missing:
   * - 'end' (default): append after all core items
   * - 'skip': do not render this contribution
   */
  preferMissing?: 'end' | 'skip';

  /**
   * Called just before render. Return false to hide this item.
   * Receives a light context so add-ons can gate on auth/flags without core knowing them.
   */
  onBeforeRender?: (ctx: SidebarRenderContext) => boolean | void;
}

export interface SidebarRenderContext {
  /** Stable ids of nav rows currently in the resolved list (core + already placed extensions). */
  visibleIds: string[];
}

/**
 * Branding overrides an add-on can contribute.
 * When present, `AppLogo` and `BrandingHead` use these URLs instead of stock Immich assets.
 * Highest `order` wins when multiple contributions are registered.
 */
export interface AppBranding {
  /** Stable unique id (for de-dupe / replace / unregister). */
  id: string;
  /** Icon-only logo URL (navbar collapsed, auth card, upload overlay, etc.). */
  logoIcon?: string;
  /** Inline / wordmark logo URL (navbar expanded, error header). */
  logoInline?: string;
  /** Full / backdrop logo URL (auth page background watermark). */
  logoBackdrop?: string;
  /**
   * Single favicon URL applied to every favicon / apple-touch-icon link.
   * Prefer `favicons` when you need per-size assets.
   */
  favicon?: string;
  /** Optional per-size favicon overrides. */
  favicons?: {
    ico?: string;
    16?: string;
    32?: string;
    48?: string;
    96?: string;
    144?: string;
    apple?: string;
  };
  /** Higher order wins; default 100. */
  order?: number;
  /** Optional gate; branding applies only when this returns true. */
  when?: () => boolean;
}

export interface AssetDetailSectionProps {
  asset: AssetResponseDto;
  isOwner: boolean;
}

/** A section an add-on can inject into the asset info / detail panel. */
export interface AssetDetailSection {
  id: string;
  order?: number;
  when?: () => boolean;
  onBeforeRender?: (ctx: AssetDetailSectionProps) => boolean | void;
  /** Svelte component; core always passes `{ asset, isOwner }`. */
  component: Component<AssetDetailSectionProps>;
  /** Extra props merged onto the component. */
  props?: Record<string, unknown>;
}

/** Detail / viewer panel extension point names that accept AssetDetailSection. */
export type AssetDetailPoint =
  | 'asset.detail.section'
  | 'asset.detail.before-tags'
  | 'asset.detail.after-map'
  | 'asset.viewer.below';

/**
 * Core Account Settings accordion keys (UserSettingsList.svelte).
 * Extensions may also use custom ids for contributed sections.
 */
export type UserSettingsSectionKey =
  | 'app-settings'
  | 'account'
  | 'user-usage-info'
  | 'api-keys'
  | 'authorized-devices'
  | 'download-settings'
  | 'feature'
  | 'notifications'
  | 'oauth'
  | 'password'
  | 'partner-sharing'
  | 'user-pin-code-settings'
  | 'user-purchase-settings'
  | (string & {});

/**
 * Visibility policy for Account Settings sections.
 * Highest `order` among gated contributions wins (same as branding).
 *
 * - Default (no contributions): every core section is shown (stock Immich).
 * - `hideByDefault: true`: only sections explicitly set `true` in `sections` are shown.
 * - `hideByDefault` false/omitted: only sections set `false` are hidden; rest stay shown.
 */
export interface UserSettingsVisibility {
  id: string;
  order?: number;
  when?: () => boolean;
  hideByDefault?: boolean;
  sections?: Partial<Record<UserSettingsSectionKey, boolean>>;
}

/** Extra accordion section contributed into Account Settings (e.g. Site settings link). */
export interface UserSettingsSection {
  id: string;
  order?: number;
  when?: () => boolean;
  title: string;
  subtitle?: string;
  icon?: string;
  /** Svelte component rendered inside the accordion body. */
  component: Component<Record<string, never>>;
  props?: Record<string, unknown>;
}

/** The set of extension points and their item types. Extend this as new slots are added. */
interface ExtensionPointMap {
  'sidebar.nav': SidebarNavItem;
  'app.branding': AppBranding;
  /** General mid-panel sections (e.g. after People). */
  'asset.detail.section': AssetDetailSection;
  /** Sections rendered immediately above the Tags block. */
  'asset.detail.before-tags': AssetDetailSection;
  /** Sections rendered in the right detail panel after the map. */
  'asset.detail.after-map': AssetDetailSection;
  /** Overlay / panel rendered below the main asset image in the viewer. */
  'asset.viewer.below': AssetDetailSection;
  /** Account Settings visibility policy (highest order wins). */
  'user.settings.visibility': UserSettingsVisibility;
  /** Extra Account Settings accordion sections. */
  'user.settings.section': UserSettingsSection;
}
type PointName = keyof ExtensionPointMap;

// Reactive so consumers re-render if a contribution registers after first paint.
const registry = $state<{ [K in PointName]: ExtensionPointMap[K][] }>({
  'sidebar.nav': [],
  'app.branding': [],
  'asset.detail.section': [],
  'asset.detail.before-tags': [],
  'asset.detail.after-map': [],
  'asset.viewer.below': [],
  'user.settings.visibility': [],
  'user.settings.section': [],
});

/** Register a contribution to an extension point. Idempotent on `id`. Returns an unregister fn. */
export function contribute<K extends PointName>(point: K, item: ExtensionPointMap[K]) {
  const list = registry[point];
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) {
    list[i] = item;
  } else {
    list.push(item);
  }
  return () => {
    const j = registry[point].findIndex((x) => x.id === item.id);
    if (j >= 0) {
      registry[point].splice(j, 1);
    }
  };
}

/** Read the (sorted, gated by `when`) contributions for a point — call this from the component. */
export function contributions<K extends PointName>(point: K): ExtensionPointMap[K][] {
  const list = [...registry[point]] as ExtensionPointMap[K][];
  return list
    .filter((x) => ('when' in x && x.when ? Boolean(x.when()) : true))
    .sort((a, b) => {
      const orderA = 'order' in a && typeof a.order === 'number' ? a.order : 100;
      const orderB = 'order' in b && typeof b.order === 'number' ? b.order : 100;
      return orderA - orderB;
    });
}

/**
 * Detail / viewer sections with asset-aware onBeforeRender gating.
 */
export function detailSections(point: AssetDetailPoint, ctx: AssetDetailSectionProps): AssetDetailSection[] {
  return contributions(point).filter((section) => section.onBeforeRender?.(ctx) !== false);
}

/**
 * Active branding contribution (highest order among gated items).
 * Used by AppLogo, BrandingHead, and auth backdrop.
 */
export function activeBranding(): AppBranding | undefined {
  const items = contributions('app.branding');
  return items.at(-1);
}

/**
 * Convenience alias for `contribute('app.branding', …)`.
 * Add-ons call this (or re-call with the same id) to change logo / favicon at runtime.
 */
export function setAppBranding(branding: AppBranding) {
  return contribute('app.branding', branding);
}

/** Resolve the logo URL for a visual variant, or `undefined` to keep the stock Logo component. */
export function brandingLogoSrc(variant: 'icon' | 'inline' | 'backdrop'): string | undefined {
  const branding = activeBranding();
  if (!branding) {
    return undefined;
  }

  if (variant === 'backdrop') {
    return branding.logoBackdrop ?? branding.logoInline ?? branding.logoIcon;
  }
  if (variant === 'inline') {
    return branding.logoInline ?? branding.logoIcon;
  }
  return branding.logoIcon ?? branding.logoInline;
}

/**
 * Active Account Settings visibility policy (highest order among gated items).
 * No contribution ⇒ stock Immich (all core sections visible).
 */
export function activeUserSettingsVisibility(): UserSettingsVisibility | undefined {
  const items = contributions('user.settings.visibility');
  return items.at(-1);
}

/**
 * Whether a core Account Settings accordion should render.
 * Extensions opt into bare-minimum via `hideByDefault` + allow-list.
 */
export function isUserSettingsSectionVisible(key: UserSettingsSectionKey): boolean {
  const policy = activeUserSettingsVisibility();
  if (!policy) {
    return true;
  }
  const override = policy.sections?.[key];
  if (typeof override === 'boolean') {
    return override;
  }
  return policy.hideByDefault ? false : true;
}

/** Convenience alias for `contribute('user.settings.visibility', …)`. */
export function setUserSettingsVisibility(policy: UserSettingsVisibility) {
  return contribute('user.settings.visibility', policy);
}

/** Extra Account Settings sections (sorted, `when`-gated). */
export function userSettingsSections(): UserSettingsSection[] {
  return contributions('user.settings.section');
}

import { setAppBranding, type AppBranding } from '$lib/extensions/ui-extension-points.svelte';
import { Theme, themeManager } from '@immich/ui';

/**
 * Product branding for PhotoAppBackend — logo C aperture monogram.
 *
 * Theme config (logo_style light/dark, default dark = white logo):
 *   1) Host override:  GET /pab-ui/theme-branding.json  (no Immich rebuild)
 *   2) Bundled static: GET /theme-branding.json
 *   3) Built-in defaults below
 *
 * When follow_theme is true, Immich light/dark theme selects styles.light / styles.dark.
 * When false, logo_style is forced ("dark" | "light").
 */

type LogoStyle = 'light' | 'dark';

type StyleAssets = {
  label?: string;
  logoIcon?: string;
  logoInline?: string;
  logoBackdrop?: string;
  favicon?: string;
  favicons?: AppBranding['favicons'] & { png?: string };
};

type ThemeBrandingConfig = {
  version?: number;
  follow_theme?: boolean;
  logo_style?: LogoStyle | string;
  styles?: Partial<Record<LogoStyle, StyleAssets>>;
};

const BUILTIN: ThemeBrandingConfig = {
  follow_theme: true,
  logo_style: 'dark',
  styles: {
    dark: {
      label: 'Dark UI — white monogram',
      logoIcon: '/brand/logo-c-aperture-p_white.svg',
      logoInline: '/brand/logo-c-aperture-p_white.svg',
      logoBackdrop: '/brand/logo-c-aperture-p_white.svg',
      favicon: '/brand/logo-c-aperture-p_white.ico',
      favicons: {
        ico: '/brand/logo-c-aperture-p_white.ico',
        png: '/brand/logo-c-aperture-p_white.png',
      },
    },
    light: {
      label: 'Light UI — color monogram (favicon always white-fill logo)',
      logoIcon: '/brand/logo-c-aperture-p_transparent.svg',
      logoInline: '/brand/logo-c-aperture-p_transparent.svg',
      logoBackdrop: '/brand/logo-c-aperture-p_transparent.svg',
      // Favicon: always white-fill monogram (readable on browser chrome light & dark)
      favicon: '/brand/logo-c-aperture-p_white.ico',
      favicons: {
        ico: '/brand/logo-c-aperture-p_white.ico',
        png: '/brand/logo-c-aperture-p_white.png',
      },
    },
  },
};

/** Favicon is always the white-fill logo — not theme-swapped with the header logo. */
const FAVICON_ICO = '/brand/logo-c-aperture-p_white.ico';
const FAVICON_PNG = '/brand/logo-c-aperture-p_white.png';

let cachedConfig: ThemeBrandingConfig = BUILTIN;
let unsubTheme: (() => void) | null = null;

function normalizeStyle(s: unknown): LogoStyle {
  const v = String(s || 'dark').toLowerCase();
  return v === 'light' ? 'light' : 'dark';
}

function resolveStyleKey(cfg: ThemeBrandingConfig): LogoStyle {
  if (cfg.follow_theme === false) {
    return normalizeStyle(cfg.logo_style);
  }
  // Immich Theme.Dark → white logo (styles.dark); light → transparent/color
  try {
    const isDark = themeManager.value === Theme.Dark;
    return isDark ? 'dark' : 'light';
  } catch {
    return normalizeStyle(cfg.logo_style);
  }
}

function assetsFor(cfg: ThemeBrandingConfig, style: LogoStyle): StyleAssets {
  const styles = cfg.styles || BUILTIN.styles || {};
  return styles[style] || styles.dark || BUILTIN.styles!.dark!;
}

function applyBranding(cfg: ThemeBrandingConfig) {
  const style = resolveStyleKey(cfg);
  const a = assetsFor(cfg, style);
  // Always pin favicon to white-fill logo (UI logos still follow theme).
  const fav = FAVICON_ICO;
  const png = FAVICON_PNG;

  setAppBranding({
    id: 'pab-product-branding',
    logoIcon: a.logoIcon || '/brand/logo-c-aperture-p_white.svg',
    logoInline: a.logoInline || a.logoIcon || '/brand/logo-c-aperture-p_white.svg',
    logoBackdrop: a.logoBackdrop || a.logoInline || a.logoIcon,
    favicon: fav,
    favicons: {
      ico: fav,
      16: png,
      32: png,
      48: png,
      96: png,
      144: png,
      apple: png,
    },
    order: 200,
  });
}

async function loadConfig(): Promise<ThemeBrandingConfig> {
  if (typeof fetch === 'undefined') return BUILTIN;
  // Prefer host-mounted pab-ui (editable without web rebuild), then bundled static
  for (const url of ['/pab-ui/theme-branding.json', '/theme-branding.json']) {
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const j = (await res.json()) as ThemeBrandingConfig;
      return {
        ...BUILTIN,
        ...j,
        styles: {
          ...BUILTIN.styles,
          ...(j.styles || {}),
        },
      };
    } catch {
      /* try next */
    }
  }
  return BUILTIN;
}

function bindThemeListener() {
  if (unsubTheme || typeof window === 'undefined') return;
  // Poll themeManager — @immich/ui ThemeManager may not expose a public subscribe API everywhere.
  // A short interval is enough for logo swap after user toggles theme.
  let last: string | null = null;
  const tick = () => {
    try {
      const key = String(themeManager.value);
      if (key !== last) {
        last = key;
        applyBranding(cachedConfig);
      }
    } catch {
      /* ignore */
    }
  };
  tick();
  const id = window.setInterval(tick, 400);
  unsubTheme = () => {
    window.clearInterval(id);
    unsubTheme = null;
  };
}

/**
 * Register branding and start following Immich light/dark theme.
 * Call `setAppBranding` again at runtime to override; unregister via returned cleanup.
 */
export function registerPabBrandingExtension() {
  applyBranding(BUILTIN);
  bindThemeListener();

  if (typeof window !== 'undefined') {
    void loadConfig().then((cfg) => {
      cachedConfig = cfg;
      applyBranding(cfg);
    });

    // Runtime override API (console / host scripts)
    (window as unknown as { PabThemeBranding?: object }).PabThemeBranding = {
      getConfig: () => cachedConfig,
      setLogoStyle: (style: LogoStyle) => {
        cachedConfig = { ...cachedConfig, follow_theme: false, logo_style: style };
        applyBranding(cachedConfig);
      },
      setFollowTheme: (follow: boolean) => {
        cachedConfig = { ...cachedConfig, follow_theme: follow };
        applyBranding(cachedConfig);
      },
      reload: async () => {
        cachedConfig = await loadConfig();
        applyBranding(cachedConfig);
      },
      apply: () => applyBranding(cachedConfig),
    };
  }

  return () => {
    unsubTheme?.();
  };
}

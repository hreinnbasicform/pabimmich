import {
  activeBranding,
  activeUserSettingsVisibility,
  brandingLogoSrc,
  contribute,
  contributions,
  isUserSettingsSectionVisible,
  setAppBranding,
  setUserSettingsVisibility,
  userSettingsSections,
} from '$lib/extensions/ui-extension-points.svelte';
import type { Component } from 'svelte';

describe('ui-extension-points', () => {
  it('registers, replaces by id, and unregisters sidebar nav items', () => {
    const unregister = contribute('sidebar.nav', {
      id: 'test-nav',
      title: 'One',
      href: '/one',
      order: 50,
    });

    expect(contributions('sidebar.nav').find((x) => x.id === 'test-nav')?.title).toBe('One');

    contribute('sidebar.nav', {
      id: 'test-nav',
      title: 'Two',
      href: '/two',
      order: 50,
    });
    expect(contributions('sidebar.nav').find((x) => x.id === 'test-nav')?.title).toBe('Two');

    // Unregister by original handle still removes by id
    unregister();
    expect(contributions('sidebar.nav').find((x) => x.id === 'test-nav')).toBeUndefined();
  });

  it('sorts by order and applies when gating', () => {
    const cleanups = [
      contribute('sidebar.nav', { id: 'test-b', title: 'B', href: '/b', order: 200 }),
      contribute('sidebar.nav', { id: 'test-a', title: 'A', href: '/a', order: 10 }),
      contribute('sidebar.nav', { id: 'test-hidden', title: 'H', href: '/h', order: 1, when: () => false }),
    ];

    const items = contributions('sidebar.nav').filter((x) => x.id.startsWith('test-'));
    expect(items.map((x) => x.id)).toEqual(['test-a', 'test-b']);

    for (const cleanup of cleanups) {
      cleanup();
    }
  });

  it('setAppBranding drives active branding and logo src resolution', () => {
    expect(brandingLogoSrc('icon')).toBeUndefined();

    const unregister = setAppBranding({
      id: 'test-brand',
      logoIcon: '/icon.png',
      logoInline: '/inline.png',
      logoBackdrop: '/backdrop.png',
      favicon: '/fav.ico',
      order: 10,
    });

    expect(activeBranding()?.id).toBe('test-brand');
    expect(brandingLogoSrc('icon')).toBe('/icon.png');
    expect(brandingLogoSrc('inline')).toBe('/inline.png');
    expect(brandingLogoSrc('backdrop')).toBe('/backdrop.png');

    // Higher order wins
    const unregister2 = setAppBranding({
      id: 'test-brand-high',
      logoIcon: '/winner.png',
      order: 999,
    });
    expect(brandingLogoSrc('icon')).toBe('/winner.png');

    unregister2();
    expect(brandingLogoSrc('icon')).toBe('/icon.png');

    unregister();
    expect(activeBranding()?.id === 'test-brand').toBe(false);
    expect(brandingLogoSrc('icon')).toBeUndefined();
  });

  it('falls back across branding logo variants', () => {
    const unregister = setAppBranding({
      id: 'test-brand-fallback',
      logoIcon: '/only-icon.png',
    });

    expect(brandingLogoSrc('inline')).toBe('/only-icon.png');
    expect(brandingLogoSrc('backdrop')).toBe('/only-icon.png');

    unregister();
  });

  it('user settings visibility defaults to all-visible with no policy', () => {
    // Isolate: any leftover policies from other tests should not apply
    const policy = activeUserSettingsVisibility();
    if (!policy || policy.id.startsWith('test-')) {
      expect(isUserSettingsSectionVisible('account')).toBe(true);
      expect(isUserSettingsSectionVisible('user-purchase-settings')).toBe(true);
    }
  });

  it('hideByDefault only shows explicitly allowed sections', () => {
    const unregister = setUserSettingsVisibility({
      id: 'test-bare-min',
      order: 500,
      hideByDefault: true,
      sections: {
        account: true,
        password: true,
        'user-purchase-settings': false,
      },
    });

    expect(activeUserSettingsVisibility()?.id).toBe('test-bare-min');
    expect(isUserSettingsSectionVisible('account')).toBe(true);
    expect(isUserSettingsSectionVisible('password')).toBe(true);
    expect(isUserSettingsSectionVisible('user-purchase-settings')).toBe(false);
    expect(isUserSettingsSectionVisible('api-keys')).toBe(false);
    expect(isUserSettingsSectionVisible('feature')).toBe(false);

    unregister();
  });

  it('opt-out visibility only hides sections set to false', () => {
    const unregister = setUserSettingsVisibility({
      id: 'test-opt-out',
      order: 510,
      hideByDefault: false,
      sections: {
        'user-purchase-settings': false,
      },
    });

    expect(isUserSettingsSectionVisible('account')).toBe(true);
    expect(isUserSettingsSectionVisible('user-purchase-settings')).toBe(false);
    expect(isUserSettingsSectionVisible('api-keys')).toBe(true);

    unregister();
  });

  it('higher-order visibility policy wins', () => {
    const u1 = setUserSettingsVisibility({
      id: 'test-vis-low',
      order: 1,
      hideByDefault: true,
      sections: { account: true },
    });
    const u2 = setUserSettingsVisibility({
      id: 'test-vis-high',
      order: 999,
      hideByDefault: false,
      sections: { 'user-purchase-settings': false },
    });

    expect(activeUserSettingsVisibility()?.id).toBe('test-vis-high');
    expect(isUserSettingsSectionVisible('api-keys')).toBe(true);
    expect(isUserSettingsSectionVisible('user-purchase-settings')).toBe(false);

    u2();
    u1();
  });

  it('registers extra user.settings.section contributions', () => {
    const Dummy = {} as Component<Record<string, never>>;
    const unregister = contribute('user.settings.section', {
      id: 'test-extra-section',
      title: 'Extra',
      order: 5,
      component: Dummy,
    });

    expect(userSettingsSections().find((s) => s.id === 'test-extra-section')?.title).toBe('Extra');
    unregister();
    expect(userSettingsSections().find((s) => s.id === 'test-extra-section')).toBeUndefined();
  });
});

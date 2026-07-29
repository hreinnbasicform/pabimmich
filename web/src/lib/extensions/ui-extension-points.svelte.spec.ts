import {
  activeBranding,
  brandingLogoSrc,
  contribute,
  contributions,
  setAppBranding,
} from '$lib/extensions/ui-extension-points.svelte';

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
});

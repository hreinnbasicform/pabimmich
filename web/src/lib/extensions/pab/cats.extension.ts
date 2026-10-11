import DetailPanelCats from '$lib/extensions/pab/DetailPanelCats.svelte';
import { contribute } from '$lib/extensions/ui-extension-points.svelte';
import { tenantFromHostname } from '$lib/extensions/pab/pab-client';
import { mdiPaw } from '@mdi/js';

/**
 * CatLink / cat-care Immich: replace face "People" with tag-based "Cats".
 * No ML — identities are hierarchical tags Animals/Cat/{Name}.
 *
 * Enabled when the site hostname looks like a CatLink tenant, or when
 * VITE_CATLINK_CATS=true is set at build time.
 */
export function isCatCareSite(hostname?: string): boolean {
  if (import.meta.env.VITE_CATLINK_CATS === 'true') {
    return true;
  }
  const t = (tenantFromHostname(hostname) || '').toLowerCase();
  if (!t) {
    return false;
  }
  return t.includes('catlink') || t === 'catlinkdev' || t === 'catlinkthin1';
}

/** True when product Cats nav is active (People should stay off the sidebar). */
export function catsNavReplacesPeople(): boolean {
  return isCatCareSite();
}

export function registerCatsExtension() {
  if (!isCatCareSite()) {
    return () => {};
  }

  const cleanups = [
    contribute('sidebar.nav', {
      id: 'cats',
      title: 'Cats',
      href: '/animals',
      icon: mdiPaw,
      // Prefer People slot; if People is off, still show near map/photos
      preferAfter: 'map',
      preferMissing: 'end',
      order: 10,
    }),
    contribute('asset.detail.section', {
      id: 'cats-detail',
      order: 15,
      component: DetailPanelCats,
    }),
  ];

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

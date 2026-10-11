import DetailPanelAnimals from '$lib/extensions/examples/DetailPanelAnimals.svelte';
import { contribute } from '$lib/extensions/ui-extension-points.svelte';
import { mdiPaw } from '@mdi/js';

/**
 * Animals as hierarchical tags (Animals/{Type}/{Name}) — no ML.
 * George the cat and George the dog are distinct tag paths on the same photo.
 */
export function registerAnimalsExtension() {
  const cleanups = [
    contribute('sidebar.nav', {
      id: 'animals',
      title: 'Cats',
      href: '/animals',
      icon: mdiPaw,
      preferAfter: 'people',
      // If People is hidden in prefs, still show Animals at the end of the nav
      preferMissing: 'end',
      order: 10,
    }),
    contribute('asset.detail.section', {
      id: 'animals-detail',
      order: 20,
      component: DetailPanelAnimals,
    }),
  ];

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

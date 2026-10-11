import DemoAssetComments from '$lib/extensions/examples/DemoAssetComments.svelte';
import DemoAssetTitle from '$lib/extensions/examples/DemoAssetTitle.svelte';
import { contribute } from '$lib/extensions/ui-extension-points.svelte';

/**
 * Demo handlers:
 * - Interactive comments under the main image (`asset.viewer.below`)
 * - Image title override in the right detail panel after the map (`asset.detail.after-map`)
 */
export function registerDetailCommentsExtension() {
  const cleanups = [
    contribute('asset.viewer.below', {
      id: 'demo-comments-below-image',
      order: 10,
      component: DemoAssetComments,
    }),
    contribute('asset.detail.after-map', {
      id: 'demo-image-title',
      order: 10,
      component: DemoAssetTitle,
    }),
  ];

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

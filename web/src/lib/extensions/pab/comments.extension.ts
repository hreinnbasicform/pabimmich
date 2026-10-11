import AssetComments from '$lib/extensions/pab/AssetComments.svelte';
import { contribute } from '$lib/extensions/ui-extension-points.svelte';

/**
 * Product: comments panel below the main image on the asset viewer.
 * Slot: `asset.viewer.below` (rendered by AssetViewer.svelte).
 */
export function registerPabCommentsExtension() {
  return contribute('asset.viewer.below', {
    id: 'pab-comments-below-image',
    order: 10,
    component: AssetComments,
  });
}

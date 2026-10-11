import { contribute } from '$lib/extensions/ui-extension-points.svelte';
import { mdiTimelineTextOutline } from '@mdi/js';

/**
 * Product extension: Activities & Ledger page (site-backed via PAB orchestrator).
 * Not demo seed data — page loads comments/likes/photos/ledger from the control plane.
 */
export function registerActivitiesExtension() {
  return contribute('sidebar.nav', {
    id: 'activities',
    title: 'Activities & Ledger',
    href: '/activities',
    icon: mdiTimelineTextOutline,
    preferAfter: 'photos',
    preferMissing: 'end',
    order: 40,
  });
}

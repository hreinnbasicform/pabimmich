import { contribute } from '$lib/extensions/ui-extension-points.svelte';
import { mdiCogOutline, mdiRobotOutline } from '@mdi/js';

/**
 * Product extension: Abbot + Site settings in the Immich user sidebar.
 * Routes: /pab/abbot and /pab/site-settings (not /abbot — that path is the chatbot
 * reverse-proxy under nginx). Both render inside Immich main via UserPageLayout.
 */
export function registerPabSiteSettingsExtension() {
  contribute('sidebar.nav', {
    id: 'abbot',
    title: 'Abbot',
    href: '/pab/abbot',
    icon: mdiRobotOutline,
    preferAfter: 'utilities',
    preferMissing: 'end',
    order: 85,
  });
  return contribute('sidebar.nav', {
    id: 'site-settings',
    title: 'Site settings',
    href: '/pab/site-settings',
    icon: mdiCogOutline,
    preferAfter: 'abbot',
    preferMissing: 'end',
    order: 90,
  });
}

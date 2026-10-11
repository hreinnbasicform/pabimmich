import SiteSettingsAccountLink from '$lib/extensions/pab/SiteSettingsAccountLink.svelte';
import { contribute, setUserSettingsVisibility } from '$lib/extensions/ui-extension-points.svelte';
import { mdiCogOutline } from '@mdi/js';

/**
 * Product: slim Account Settings for multi-tenant Immich.
 *
 * - hideByDefault: only allow-listed sections render (bare minimum)
 * - Purchase / usage / API keys / features / partners / OAuth UI stay off
 * - Adds a Site settings accordion that links to /pab/site-settings
 */
export function registerPabUserSettingsExtension() {
  setUserSettingsVisibility({
    id: 'pab-user-settings-bare-min',
    order: 100,
    hideByDefault: true,
    sections: {
      // Essentials only
      account: true,
      password: true,
      'authorized-devices': true,
      notifications: true,
      'user-pin-code-settings': true,
      // Explicitly hide Immich commercial / advanced surface
      'user-purchase-settings': false,
      'user-usage-info': false,
      'api-keys': false,
      'download-settings': false,
      feature: false,
      'app-settings': false,
      oauth: false,
      'partner-sharing': false,
    },
  });

  return contribute('user.settings.section', {
    id: 'pab-site-settings-link',
    order: 10,
    title: 'Site settings',
    subtitle: 'Manage this site (cache, geofences, billing)',
    icon: mdiCogOutline,
    component: SiteSettingsAccountLink,
  });
}

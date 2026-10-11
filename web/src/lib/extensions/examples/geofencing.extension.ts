import { contribute } from '$lib/extensions/ui-extension-points.svelte';
import { mdiMapMarkerRadiusOutline } from '@mdi/js';

// An add-on registers its UI contributions on import. In a real add-on this module
// would live outside core and be loaded by a plugin loader (future PR); for the demo
// it is imported once from the extensions barrel.
export function registerGeofencingExtension() {
  contribute('sidebar.nav', {
    id: 'geofencing',
    title: 'Geofencing', // add-on-owned label; swap for $t(...) if it ships its own catalog
    href: '/geofencing',
    icon: mdiMapMarkerRadiusOutline,
    preferAfter: 'map',
    preferMissing: 'end',
    order: 60,
  });
}

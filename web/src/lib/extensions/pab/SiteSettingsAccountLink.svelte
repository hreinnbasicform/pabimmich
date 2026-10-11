<script lang="ts">
  /**
   * Body of the contributed "Site settings" accordion on Account Settings.
   * Points at the in-app PAB route registered by site-settings.extension.ts.
   */
  import { Button, Text } from '@immich/ui';
</script>

<div class="flex flex-col gap-3 py-2">
  <Text>Site-wide options for this deployment — cache, geofences, billing, and more.</Text>
  <div>
    <Button href="/pab/site-settings" size="small">Open Site settings</Button>
  </div>
</div>

<script lang="ts">
  /**
   * Demo override for the right detail panel (after map): show image title / filename.
   * Proves `asset.detail.after-map` can inject custom UI next to the map region.
   */
  import type { AssetResponseDto } from '@immich/sdk';
  import { Text } from '@immich/ui';

  interface Props {
    asset: AssetResponseDto;
    isOwner: boolean;
  }

  let { asset, isOwner: _isOwner }: Props = $props();

  const title = $derived(asset.originalFileName || asset.id);
  const subtitle = $derived(
    [asset.exifInfo?.city, asset.exifInfo?.state, asset.exifInfo?.country].filter(Boolean).join(', ') || undefined,
  );
</script>

<section class="px-4 py-3 dark:text-immich-dark-fg" data-testid="demo-asset-title">
  <Text size="small" color="muted">Image title (extension override)</Text>
  <h2 class="mt-1 text-base font-semibold wrap-break-word text-primary">{title}</h2>
  {#if subtitle}
    <p class="mt-0.5 text-xs opacity-70">{subtitle}</p>
  {/if}
  <p class="mt-1 text-[10px] opacity-50">
    Contributed via <code>asset.detail.after-map</code> — replace with custom branding, captions, etc.
  </p>
</section>

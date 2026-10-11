<script lang="ts">
  /**
   * Thin host for the external `pab-asset-comments` custom element.
   * UI lives in `/pab-ui/asset-comments.js` (host-mounted; no Docker rebuild).
   */
  import type { AssetResponseDto } from '@immich/sdk';
  import { onMount } from 'svelte';
  import { ensurePabUiLoaded } from '$lib/extensions/pab/runtime-loader';

  interface Props {
    asset: AssetResponseDto;
    isOwner: boolean;
  }

  let { asset, isOwner }: Props = $props();

  let status = $state<'loading' | 'ready' | 'missing'>('loading');
  let detail = $state<string | null>(null);
  let hostEl: HTMLElement | undefined = $state();

  onMount(() => {
    let cancelled = false;
    void (async () => {
      await ensurePabUiLoaded();
      if (cancelled) return;
      if (customElements.get('pab-asset-comments')) {
        status = 'ready';
        detail = null;
      } else {
        status = 'missing';
        detail =
          (typeof window !== 'undefined' && window.__PAB_UI_LOAD_ERROR__) ||
          'Custom element not registered — check Network tab for /pab-ui/asset-comments.js';
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (!hostEl) return;
    hostEl.setAttribute('asset-id', asset.id);
    if (isOwner) hostEl.setAttribute('is-owner', '');
    else hostEl.removeAttribute('is-owner');
  });
</script>

{#if status === 'loading'}
  <section
    class="border-t border-gray-200 bg-white/95 p-3 text-xs opacity-60 dark:border-gray-700 dark:bg-immich-dark-bg/95"
    data-testid="pab-asset-comments"
  >
    Loading comments…
  </section>
{:else if status === 'missing'}
  <section
    class="border-t border-gray-200 bg-white/95 p-3 text-xs opacity-70 dark:border-gray-700 dark:bg-immich-dark-bg/95"
    data-testid="pab-asset-comments"
  >
    <p class="mb-1">Comments extension failed to load.</p>
    {#if detail}
      <p class="opacity-80">{detail}</p>
    {/if}
    <p class="mt-1 opacity-60">
      Expected <code class="text-[11px]">/pab-ui/asset-comments.js</code>. Hard-refresh after deploy.
    </p>
  </section>
{:else}
  <pab-asset-comments
    bind:this={hostEl}
    asset-id={asset.id}
    is-owner={isOwner ? '' : undefined}
    data-testid="pab-asset-comments"
  ></pab-asset-comments>
{/if}

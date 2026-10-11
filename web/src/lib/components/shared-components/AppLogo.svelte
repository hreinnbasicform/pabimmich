<script lang="ts">
  /**
   * Drop-in replacement for `@immich/ui` Logo that honours `app.branding` contributions.
   * With no branding registered, renders the stock Immich Logo (zero visual change).
   */
  import { brandingLogoSrc } from '$lib/extensions/ui-extension-points.svelte';
  import { Logo } from '@immich/ui';

  type LogoVariant = 'icon' | 'inline';
  type LogoSize = 'tiny' | 'small' | 'medium' | 'large' | 'giant' | 'landing';

  interface Props {
    variant?: LogoVariant;
    size?: LogoSize;
    class?: string;
    /** Accessible name when rendering a custom image. */
    alt?: string;
  }

  let { variant = 'icon', size, class: className = '', alt = 'Logo' }: Props = $props();

  const customSrc = $derived(brandingLogoSrc(variant === 'inline' ? 'inline' : 'icon'));

  const sizeClass = $derived.by(() => {
    switch (size) {
      case 'tiny': {
        return 'h-4 w-4';
      }
      case 'small': {
        return 'h-6 w-6';
      }
      case 'medium': {
        return 'h-8 w-8';
      }
      case 'large': {
        return 'h-10 w-10';
      }
      case 'giant': {
        return 'h-16 w-16';
      }
      default: {
        return variant === 'inline' ? 'h-10' : 'h-8 w-8';
      }
    }
  });
</script>

{#if customSrc}
  <img src={customSrc} {alt} class="object-contain {sizeClass} {className}" draggable="false" />
{:else}
  <Logo {variant} {size} class={className} />
{/if}

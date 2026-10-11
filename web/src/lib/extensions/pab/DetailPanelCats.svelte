<script lang="ts">
  /**
   * Owner: attach known cats to a photo via Animals/Cat/{Name} tags (no ML).
   * List + add; select from existing cat tags when present on the asset set.
   */
  import OnEvents from '$lib/components/OnEvents.svelte';
  import {
    animalDisplayLabel,
    animalTagPath,
    parseAnimalTagPath,
  } from '$lib/extensions/animals/tag-path';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { Route } from '$lib/route';
  import { removeTag, tagAssets } from '$lib/utils/asset-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { getAllTags, getAssetInfo, upsertTags, type AssetResponseDto, type TagResponseDto } from '@immich/sdk';
  import { Badge, Button, Link, Text } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    asset: AssetResponseDto;
    isOwner: boolean;
  }

  let { asset = $bindable(), isOwner }: Props = $props();

  let catName = $state('');
  let busy = $state(false);
  let catalog: { path: string; name: string; tagId?: string }[] = $state([]);

  const catsOnAsset = $derived(
    (asset.tags ?? [])
      .map((tag: TagResponseDto) => {
        const identity = parseAnimalTagPath(tag.value);
        if (!identity || identity.type.toLowerCase() !== 'cat') {
          return null;
        }
        return { tag, identity };
      })
      .filter(
        (x): x is { tag: TagResponseDto; identity: NonNullable<ReturnType<typeof parseAnimalTagPath>> } =>
          x !== null,
      ),
  );

  const onAssetIds = $derived(new Set(catsOnAsset.map((c) => c.identity.path.toLowerCase())));

  async function loadCatalog() {
    try {
      const tags = await getAllTags();
      catalog = tags
        .map((tag) => {
          const identity = parseAnimalTagPath(tag.value);
          if (!identity || identity.type.toLowerCase() !== 'cat') {
            return null;
          }
          return { path: identity.path, name: identity.name, tagId: tag.id };
        })
        .filter((x): x is { path: string; name: string; tagId: string } => x !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      catalog = [];
    }
  }

  onMount(() => {
    void loadCatalog();
  });

  const onAssetsTag = async (ids: string[]) => {
    if (ids.includes(asset.id)) {
      asset = await getAssetInfo({ id: asset.id });
      void loadCatalog();
    }
  };

  const handleAdd = async (nameRaw: string) => {
    const name = nameRaw.trim();
    if (!name || busy) {
      return;
    }
    busy = true;
    try {
      const path = animalTagPath('Cat', name);
      const [tag] = await upsertTags({ tagUpsertDto: { tags: [path] } });
      await tagAssets({ tagIds: [tag.id], assetIds: [asset.id], showNotification: false });
      eventManager.emit('AssetsTag', [asset.id]);
      asset = await getAssetInfo({ id: asset.id });
      catName = '';
      void loadCatalog();
    } catch (error) {
      handleError(error, 'Unable to add cat');
    } finally {
      busy = false;
    }
  };

  const handleRemove = async (tagId: string) => {
    const ids = await removeTag({ tagIds: [tagId], assetIds: [asset.id], showNotification: false });
    if (ids) {
      asset = await getAssetInfo({ id: asset.id });
    }
  };
</script>

<OnEvents {onAssetsTag} />

{#if isOwner}
  <section class="px-4 pt-4 text-sm" data-testid="detail-panel-cats">
    <div class="flex h-10 w-full items-center justify-between">
      <Text size="small" color="muted">Cats</Text>
      <Link href="/animals" class="text-xs opacity-70">All cats</Link>
    </div>

    <div class="mt-1 flex flex-wrap gap-1">
      {#each catsOnAsset as { tag, identity } (tag.id)}
        <Badge
          onClose={() => handleRemove(tag.id)}
          size="small"
          shape="round"
          translations={{ close: $t('remove_tag') }}
        >
          <Link href={Route.tags({ path: tag.value })} underline={false} class="px-2 font-light">
            {identity.name}
          </Link>
        </Badge>
      {:else}
        <Text size="tiny" color="muted">No cats on this photo yet — pick one below or type a name.</Text>
      {/each}
    </div>

    {#if catalog.length > 0}
      <div class="mt-3">
        <Text size="tiny" color="muted" class="mb-1 block">Known cats</Text>
        <div class="flex flex-wrap gap-1">
          {#each catalog as c (c.path)}
            {@const on = onAssetIds.has(c.path.toLowerCase())}
            <button
              type="button"
              class="rounded-full border px-2 py-0.5 text-xs transition-colors
                {on
                ? 'border-primary bg-primary/15 font-semibold'
                : 'border-gray-300 dark:border-gray-600 hover:border-primary'}"
              disabled={busy || on}
              onclick={() => void handleAdd(c.name)}
            >
              {on ? `✓ ${c.name}` : c.name}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <form
      class="mt-3 flex flex-wrap items-end gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        void handleAdd(catName);
      }}
    >
      <label class="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs">
        <span class="opacity-70">New cat name</span>
        <input
          class="rounded border border-gray-300 bg-transparent px-2 py-1 dark:border-gray-600"
          bind:value={catName}
          placeholder="e.g. Mango"
          data-testid="input-cat-name"
        />
      </label>
      <Button type="submit" size="small" disabled={busy || !catName.trim()}>Add cat</Button>
    </form>

    <Text size="tiny" color="muted" class="mt-2 block opacity-70">
      Stored as tags <code class="text-[10px]">Animals/Cat/Name</code> — no face ML yet.
    </Text>
  </section>
{/if}

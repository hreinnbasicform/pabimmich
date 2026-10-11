<script lang="ts">
  import OnEvents from '$lib/components/OnEvents.svelte';
  import { animalDisplayLabel, animalTagPath, parseAnimalTagPath } from '$lib/extensions/animals/tag-path';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { Route } from '$lib/route';
  import { removeTag, tagAssets } from '$lib/utils/asset-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { getAssetInfo, upsertTags, type AssetResponseDto, type TagResponseDto } from '@immich/sdk';
  import { Badge, Button, Link, Text } from '@immich/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    asset: AssetResponseDto;
    isOwner: boolean;
  }

  let { asset = $bindable(), isOwner }: Props = $props();

  let animalName = $state('');
  let animalType = $state('Cat');
  let busy = $state(false);

  const animals = $derived(
    (asset.tags ?? [])
      .map((tag: TagResponseDto) => {
        const identity = parseAnimalTagPath(tag.value);
        return identity ? { tag, identity } : null;
      })
      .filter((x): x is { tag: TagResponseDto; identity: NonNullable<ReturnType<typeof parseAnimalTagPath>> } => x !== null),
  );

  const onAssetsTag = async (ids: string[]) => {
    if (ids.includes(asset.id)) {
      asset = await getAssetInfo({ id: asset.id });
    }
  };

  const handleAdd = async () => {
    const name = animalName.trim();
    const type = animalType.trim();
    if (!name || !type || busy) {
      return;
    }

    busy = true;
    try {
      const path = animalTagPath(type, name);
      const [tag] = await upsertTags({ tagUpsertDto: { tags: [path] } });
      await tagAssets({ tagIds: [tag.id], assetIds: [asset.id], showNotification: false });
      eventManager.emit('AssetsTag', [asset.id]);
      asset = await getAssetInfo({ id: asset.id });
      animalName = '';
    } catch (error) {
      handleError(error, 'Unable to add animal');
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
  <section class="px-4 pt-4 text-sm" data-testid="detail-panel-animals">
    <div class="flex h-10 w-full items-center justify-between">
      <Text size="small" color="muted">Animals</Text>
    </div>

    <div class="mt-1 flex flex-wrap gap-1">
      {#each animals as { tag, identity } (tag.id)}
        <Badge
          onClose={() => handleRemove(tag.id)}
          size="small"
          shape="round"
          translations={{ close: $t('remove_tag') }}
        >
          <Link href={Route.tags({ path: tag.value })} underline={false} class="px-2 font-light">
            {animalDisplayLabel(identity)}
          </Link>
        </Badge>
      {:else}
        <Text size="tiny" color="muted">No animals tagged — add one below (e.g. George the cat).</Text>
      {/each}
    </div>

    <form
      class="mt-3 flex flex-wrap items-end gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        void handleAdd();
      }}
    >
      <label class="flex flex-col gap-1 text-xs">
        <span class="opacity-70">Type</span>
        <input
          class="rounded border border-gray-300 bg-transparent px-2 py-1 dark:border-gray-600"
          bind:value={animalType}
          list="animal-type-suggestions"
          placeholder="Cat"
        />
        <datalist id="animal-type-suggestions">
          <option value="Cat"></option>
          <option value="Dog"></option>
          <option value="Bird"></option>
          <option value="Horse"></option>
          <option value="Other"></option>
        </datalist>
      </label>
      <label class="flex flex-col gap-1 text-xs">
        <span class="opacity-70">Name</span>
        <input
          class="rounded border border-gray-300 bg-transparent px-2 py-1 dark:border-gray-600"
          bind:value={animalName}
          placeholder="George"
        />
      </label>
      <Button type="submit" size="small" disabled={busy || !animalName.trim() || !animalType.trim()}>Add</Button>
    </form>
  </section>
{/if}

<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import {
    animalDisplayLabel,
    isAnimalTagPath,
    parseAnimalTagPath,
    type AnimalIdentity,
  } from '$lib/extensions/animals/tag-path';
  import { Route } from '$lib/route';
  import type { TagResponseDto } from '@immich/sdk';
  import { Link, Text } from '@immich/ui';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  type AnimalEntry = { tag: TagResponseDto; identity: AnimalIdentity };

  const animals = $derived(
    (data.tags as TagResponseDto[])
      .filter((tag: TagResponseDto) => isAnimalTagPath(tag.value))
      .map((tag: TagResponseDto): AnimalEntry => ({ tag, identity: parseAnimalTagPath(tag.value)! }))
      .sort((a: AnimalEntry, b: AnimalEntry) => {
        const typeCmp = a.identity.type.localeCompare(b.identity.type);
        return typeCmp !== 0 ? typeCmp : a.identity.name.localeCompare(b.identity.name);
      }),
  );

  const byType = $derived.by(() => {
    const map = new Map<string, typeof animals>();
    for (const entry of animals) {
      const list = map.get(entry.identity.type) ?? [];
      list.push(entry);
      map.set(entry.identity.type, list);
    }
    return [...map.entries()];
  });
</script>

<UserPageLayout title="Animals">
  <div class="m-auto w-full max-w-3xl p-4">
    <Text color="muted" class="mb-4 block">
      Animals are stored as hierarchical tags (<code>Animals/Type/Name</code>) so George the cat and George the dog can
      both appear on the same photo. No ML — tag them from the asset info panel.
    </Text>

    {#if animals.length === 0}
      <p class="opacity-70">No animals yet. Open a photo → Info → Animals, then add a type and name.</p>
    {:else}
      {#each byType as [type, entries] (type)}
        <section class="mb-6">
          <h2 class="mb-2 text-lg font-semibold">{type}</h2>
          <ul class="grid gap-2 sm:grid-cols-2">
            {#each entries as { tag, identity } (tag.id)}
              <li>
                <Link
                  href={Route.tags({ path: tag.value })}
                  class="block rounded-lg border border-gray-200 px-3 py-2 hover:border-primary dark:border-gray-700"
                >
                  {animalDisplayLabel(identity)}
                </Link>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    {/if}
  </div>
</UserPageLayout>

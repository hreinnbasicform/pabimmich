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

  // Prefer cats first (CatLink); other animal types still listed for multi-species sites
  const cats = $derived(animals.filter((e) => e.identity.type.toLowerCase() === 'cat'));
  const otherByType = $derived.by(() => {
    const map = new Map<string, typeof animals>();
    for (const entry of animals) {
      if (entry.identity.type.toLowerCase() === 'cat') continue;
      const list = map.get(entry.identity.type) ?? [];
      list.push(entry);
      map.set(entry.identity.type, list);
    }
    return [...map.entries()];
  });
</script>

<UserPageLayout title="Cats">
  <div class="m-auto w-full max-w-3xl p-4" data-testid="page-cats">
    <Text color="muted" class="mb-4 block">
      Community cats are stored as tags (<code>Animals/Cat/Name</code>) — pick from the list on a photo, no face ML yet.
      Name a cat once; reuse it on every sighting.
    </Text>

    {#if cats.length === 0 && otherByType.length === 0}
      <p class="opacity-70">
        No cats yet. Open a photo → Info → <strong>Cats</strong>, then pick an existing name or add a new one.
      </p>
    {:else}
      <section class="mb-6">
        <h2 class="mb-2 text-lg font-semibold">Cats ({cats.length})</h2>
        {#if cats.length === 0}
          <p class="opacity-70 text-sm">No cat tags yet.</p>
        {:else}
          <ul class="grid gap-2 sm:grid-cols-2">
            {#each cats as { tag, identity } (tag.id)}
              <li>
                <Link
                  href={Route.tags({ path: tag.value })}
                  class="block rounded-lg border border-gray-200 px-3 py-2 hover:border-primary dark:border-gray-700"
                  data-testid={`cat-card-${identity.name}`}
                >
                  {identity.name}
                </Link>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      {#each otherByType as [type, entries] (type)}
        <section class="mb-6">
          <h2 class="mb-2 text-lg font-semibold opacity-80">{type}</h2>
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

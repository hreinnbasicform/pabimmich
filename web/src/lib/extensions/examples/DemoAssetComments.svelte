<script lang="ts">
  /**
   * Interactive comments tester for the asset.viewer.below extension slot.
   * In-memory only (not persisted) — 3–4 seed comments, add + delete.
   */
  import type { AssetResponseDto } from '@immich/sdk';
  import { Button, IconButton, Text } from '@immich/ui';
  import { mdiDeleteOutline, mdiSend } from '@mdi/js';

  interface Props {
    asset: AssetResponseDto;
    isOwner: boolean;
  }

  type DemoComment = {
    id: string;
    author: string;
    text: string;
    at: string;
  };

  let { asset, isOwner: _isOwner }: Props = $props();

  let draft = $state('');
  let comments = $state<DemoComment[]>([]);
  let loadedFor = $state<string | undefined>(undefined);

  const seedComments = (assetId: string): DemoComment[] => [
    {
      id: `${assetId}-c1`,
      author: 'Alex',
      text: 'Beautiful light on this one.',
      at: '2 hours ago',
    },
    {
      id: `${assetId}-c2`,
      author: 'Sam',
      text: 'Is this George the cat? Looks like him!',
      at: '1 hour ago',
    },
    {
      id: `${assetId}-c3`,
      author: 'Jordan',
      text: 'Love the expression — keepers folder material.',
      at: '45 min ago',
    },
    {
      id: `${assetId}-c4`,
      author: 'Riley',
      text: 'Demo comment (extension) — not saved to the server.',
      at: 'just now',
    },
  ];

  $effect(() => {
    if (loadedFor === asset.id) {
      return;
    }
    comments = seedComments(asset.id);
    loadedFor = asset.id;
    draft = '';
  });

  const addComment = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    comments = [
      {
        id: `${asset.id}-${crypto.randomUUID()}`,
        author: 'You',
        text,
        at: 'just now',
      },
      ...comments,
    ];
    draft = '';
  };

  const deleteComment = (id: string) => {
    comments = comments.filter((c) => c.id !== id);
  };
</script>

<section
  class="border-t border-gray-200 bg-white/95 p-3 text-dark shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-immich-dark-bg/95 dark:text-immich-dark-fg"
  data-testid="demo-asset-comments"
>
  <div class="mb-2 flex items-center justify-between gap-2">
    <Text size="small" color="muted">Latest comments (extension tester)</Text>
    <span class="text-xs opacity-60">{comments.length}</span>
  </div>

  <ul class="mb-3 max-h-36 space-y-2 overflow-y-auto pe-1 text-sm">
    {#each comments as comment (comment.id)}
      <li
        class="flex items-start justify-between gap-2 rounded-md border border-gray-200/80 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-immich-dark-gray/40"
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0">
            <span class="font-medium text-primary">{comment.author}</span>
            <span class="text-xs opacity-50">{comment.at}</span>
          </div>
          <p class="wrap-break-word text-sm opacity-90">{comment.text}</p>
        </div>
        <IconButton
          icon={mdiDeleteOutline}
          aria-label="Delete comment"
          size="small"
          shape="round"
          color="secondary"
          variant="ghost"
          onclick={() => deleteComment(comment.id)}
        />
      </li>
    {:else}
      <li class="text-xs opacity-60">No comments yet — add one below.</li>
    {/each}
  </ul>

  <form
    class="flex items-end gap-2"
    onsubmit={(e) => {
      e.preventDefault();
      addComment();
    }}
  >
    <label class="min-w-0 flex-1 text-xs">
      <span class="mb-1 block opacity-70">Add a comment</span>
      <input
        class="w-full rounded-md border border-gray-300 bg-transparent px-2 py-1.5 text-sm dark:border-gray-600"
        bind:value={draft}
        placeholder="Write something…"
        maxlength={500}
      />
    </label>
    <Button type="submit" size="small" disabled={!draft.trim()} leadingIcon={mdiSend}>Add</Button>
  </form>
  <p class="mt-1 text-[10px] opacity-50">In-memory demo only — proves <code>asset.viewer.below</code>.</p>
</section>

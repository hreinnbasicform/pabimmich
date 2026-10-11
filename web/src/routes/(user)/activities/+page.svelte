<script lang="ts">
  /**
   * Activities & Ledger — site-scoped activity from PAB orchestrator.
   * Comments/likes are always persisted on the site (POST /photos/:hash/…); this page only lists feeds.
   * Configure VITE_PAB_* or paste credentials below (stored in localStorage).
   */
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import {
    clearPabPassport,
    fetchActivityDashboard,
    getPabConfig,
    postLike,
    savePabConfig,
    type ActivityBuckets,
  } from '$lib/extensions/pab/pab-client';
  import { Button, Text } from '@immich/ui';
  import { onMount } from 'svelte';

  let loading = $state(true);
  let error = $state<string | null>(null);
  let data = $state<ActivityBuckets | null>(null);
  let configured = $state(false);

  let formBase = $state('');
  let formTenant = $state('');
  let formPassport = $state('');

  const load = async () => {
    loading = true;
    error = null;
    configured = !!getPabConfig();
    try {
      if (!configured) {
        data = null;
        return;
      }
      data = await fetchActivityDashboard(30);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      data = null;
    } finally {
      loading = false;
    }
  };

  onMount(() => {
    const cfg = getPabConfig();
    if (cfg) {
      formBase = cfg.apiBase;
      formTenant = cfg.tenant;
      // do not prefill passport into the input for safety
    } else {
      formBase = String(import.meta.env.VITE_PAB_API_BASE || `${window.location.origin}/pab-api`);
      formTenant = String(import.meta.env.VITE_PAB_TENANT || '');
    }
    void load();
  });

  const saveAndLoad = async () => {
    savePabConfig({
      apiBase: formBase.trim(),
      tenant: formTenant.trim(),
      passport: formPassport.trim() || getPabConfig()?.passport || '',
    });
    formPassport = '';
    await load();
  };

  const disconnect = async () => {
    clearPabPassport();
    configured = false;
    data = null;
    error = null;
  };

  const likePhoto = async (hash: string) => {
    try {
      await postLike(hash);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  };

  const fmt = (iso: string | null | undefined) => {
    if (!iso) {
      return '';
    }
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };
</script>

<UserPageLayout title="Activities & Ledger">
  <div class="m-auto w-full max-w-4xl space-y-8 p-4">
    <Text color="muted" class="block">
      Site-backed feed from the PAB control plane: recent photos, comments, likes, and ledger entries. Comments and
      likes are always stored on the site (not in the browser). Demo extension comments under the asset viewer are
      separate and do not write here.
    </Text>

    <!-- Connection -->
    <section class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <h2 class="mb-2 text-lg font-semibold">PAB connection</h2>
      {#if configured}
        <p class="mb-3 text-sm opacity-80">
          Connected to <code>{getPabConfig()?.apiBase}</code> · tenant <code>{getPabConfig()?.tenant}</code>
        </p>
        <div class="flex flex-wrap gap-2">
          <Button size="small" onclick={() => load()}>Refresh</Button>
          <Button size="small" color="secondary" onclick={() => disconnect()}>Clear passport</Button>
        </div>
      {:else}
        <p class="mb-3 text-sm opacity-80">
          Set <code>VITE_PAB_API_BASE</code>, <code>VITE_PAB_TENANT</code>, <code>VITE_PAB_PASSPORT</code> or paste
          below (passport is stored in localStorage as <code>pab_passport</code>).
        </p>
        <div class="grid gap-2 sm:grid-cols-3">
          <label class="text-sm"
            >API base
            <input class="mt-1 w-full rounded border px-2 py-1 dark:bg-gray-900" bind:value={formBase} />
          </label>
          <label class="text-sm"
            >Tenant (sitename)
            <input class="mt-1 w-full rounded border px-2 py-1 dark:bg-gray-900" bind:value={formTenant} />
          </label>
          <label class="text-sm"
            >Passport
            <input
              class="mt-1 w-full rounded border px-2 py-1 dark:bg-gray-900"
              type="password"
              autocomplete="off"
              bind:value={formPassport}
              placeholder="X-Auth-Key"
            />
          </label>
        </div>
        <div class="mt-3">
          <Button size="small" onclick={() => saveAndLoad()}>Save &amp; load</Button>
        </div>
      {/if}
    </section>

    {#if loading}
      <p class="opacity-70">Loading…</p>
    {:else if error}
      <p class="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    {:else if !data}
      <p class="opacity-70">Configure PAB to load site activity.</p>
    {:else}
      <!-- Photos -->
      <section>
        <h2 class="mb-3 text-lg font-semibold">Recent photos</h2>
        {#if !data.photos?.length}
          <p class="opacity-70">No photos yet.</p>
        {:else}
          <ul class="divide-y divide-gray-200 dark:divide-gray-700">
            {#each data.photos as p (p.photo_hash)}
              <li class="flex items-center justify-between gap-3 py-2">
                <div class="min-w-0">
                  <div class="truncate font-medium">{p.caption || p.filename || p.photo_hash.slice(0, 12)}</div>
                  <div class="text-xs opacity-60">{fmt(p.timestamp || p.created_at)} · {p.photo_hash.slice(0, 10)}…</div>
                </div>
                <Button size="small" color="secondary" onclick={() => likePhoto(p.photo_hash)}>Like (save)</Button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- Comments -->
      <section>
        <h2 class="mb-3 text-lg font-semibold">Recent comments</h2>
        {#if !data.comments?.length}
          <p class="opacity-70">No comments yet. Comment via <code>POST /photos/:hash/comments</code> (site DB).</p>
        {:else}
          <ul class="divide-y divide-gray-200 dark:divide-gray-700">
            {#each data.comments as c (c.id)}
              <li class="py-2">
                <div class="text-sm">{c.body}</div>
                <div class="text-xs opacity-60">
                  photo {c.photo_hash.slice(0, 10)}… · user {c.author_user_id ?? '—'} · {fmt(c.created_at)}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- Reactions -->
      <section>
        <h2 class="mb-3 text-lg font-semibold">Recent likes</h2>
        {#if !data.reactions?.length}
          <p class="opacity-70">No reactions yet.</p>
        {:else}
          <ul class="divide-y divide-gray-200 dark:divide-gray-700">
            {#each data.reactions as r (r.id)}
              <li class="py-2 text-sm">
                <span class="font-medium">{r.type}</span>
                <span class="opacity-70">
                  · photo {r.photo_hash.slice(0, 10)}… · user {r.user_id} · {fmt(r.created_at)}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- Ledger -->
      <section>
        <h2 class="mb-3 text-lg font-semibold">Recent ledger</h2>
        {#if !data.ledger?.length}
          <p class="opacity-70">No ledger rows visible (empty, or not owner/master / no own rows).</p>
        {:else}
          <ul class="divide-y divide-gray-200 dark:divide-gray-700">
            {#each data.ledger as e (e.id)}
              <li class="py-2 text-sm">
                <div class="font-medium">
                  {e.event}
                  {#if e.amount != null}
                    · {e.amount}{e.currency ? ` ${e.currency}` : ''}
                  {/if}
                </div>
                <div class="text-xs opacity-60">
                  {e.subject} · {e.description || e.text || '—'} · {fmt(e.transaction_date || e.created_at)}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </div>
</UserPageLayout>

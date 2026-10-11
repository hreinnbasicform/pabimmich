<script lang="ts">
  /**
   * Abbot — site-bound operator chatbot, in-app Immich route.
   * Renders inside UserPageLayout → Immich sidebar + main content area.
   * Chat UI is proxied at same-origin /abbot/ (nginx → Abbot :8200).
   */
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import {
    ensurePabWebAuth,
    getPabConfig,
    tenantFromHostname,
  } from '$lib/extensions/pab/pab-client';
  import { Button, Text } from '@immich/ui';
  import { onMount } from 'svelte';

  let status = $state<'loading' | 'ready' | 'error'>('loading');
  let message = $state('Connecting…');
  let tenant = $state('');
  let iframeSrc = $state('/abbot/?embed=1');

  onMount(() => {
    void (async () => {
      try {
        tenant = tenantFromHostname() || getPabConfig()?.tenant || '';
        const cfg = await ensurePabWebAuth();
        if (!cfg) {
          status = 'error';
          message =
            'Could not authenticate with PAB. Sign in to Immich on a site host (e.g. yoursite.pab-test.example.invalid).';
          return;
        }
        tenant = cfg.tenant || tenant;
        // Prefetch bind so the iframe session is primed (iframe also binds from localStorage)
        try {
          await fetch('/abbot/api/bind', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'X-Tenant': cfg.tenant,
              'X-Auth-Key': cfg.passport,
            },
            body: JSON.stringify({ site: cfg.tenant, auth_key: cfg.passport }),
          });
        } catch {
          /* iframe will retry */
        }
        iframeSrc = `/abbot/?embed=1&t=${Date.now()}`;
        status = 'ready';
        message = `Bound to ${tenant}`;
      } catch (e) {
        status = 'error';
        message = e instanceof Error ? e.message : String(e);
      }
    })();
  });
</script>

<UserPageLayout title="Abbot" description="Site operator chatbot (geofences, photos, members)">
  <div class="flex h-full min-h-0 flex-col gap-3 p-3 md:p-4">
    <div
      class="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-immich-dark-gray/40"
    >
      {#if status === 'loading'}
        <Text color="muted">Connecting to Abbot…</Text>
      {:else if status === 'error'}
        <Text class="text-red-600 dark:text-red-400">{message}</Text>
        <Button size="small" href="/photos">Back to photos</Button>
      {:else}
        <Text color="muted">{message}</Text>
        <span class="text-xs opacity-60">same-origin /abbot · uses Immich session</span>
      {/if}
    </div>

    {#if status !== 'error'}
      <div
        class="relative min-h-[min(70vh,720px)] flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-immich-dark-gray"
      >
        <iframe
          title="Abbot"
          class="absolute inset-0 h-full w-full border-0 bg-light dark:bg-immich-dark-bg"
          src={iframeSrc}
          allow="clipboard-write"
        ></iframe>
      </div>
    {/if}
  </div>
</UserPageLayout>

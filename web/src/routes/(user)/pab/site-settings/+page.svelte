<script lang="ts">
  /**
   * Site settings — Immich in-app page (extension sidebar → /pab/site-settings).
   * Owner tools, billing summary, ledger filters. Abbot lives on /pab/abbot only.
   */
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { pabFetch, tenantFromHostname, ensurePabWebAuth } from '$lib/extensions/pab/pab-client';
  import { Button, Text } from '@immich/ui';
  import { onMount } from 'svelte';

  type UsageRow = { event?: string; count?: number };
  type Billing = {
    paid_until?: string | null;
    trial_expires_at?: string | null;
    service_ends_at?: string | null;
    days_left?: number;
    balance_usd_estimate?: number;
    active?: boolean;
    pay_url?: string;
    pay_path?: string;
    ledger_url?: string;
    ledger_path?: string;
    usage_by_event?: UsageRow[];
  };
  type SiteSettings = {
    sitename?: string;
    counts?: { photos?: number; geofences?: number; members?: number; geofence_index_rows?: number };
    geofence_index?: { enabled?: boolean; stale?: boolean };
    auth_mode?: string;
    billing?: Billing | null;
    ledger?: { event_types?: string[]; list_url?: string; ui_path?: string; ui_url?: string };
    links?: {
      pay?: string;
      pay_url?: string;
      pay_dashboard?: string;
      ledger?: string;
      ledger_url?: string;
      ledger_api?: string;
    };
  };
  type LedgerEntry = {
    id?: number;
    event?: string;
    subject?: string;
    description?: string;
    amount?: number | null;
    transaction_date?: string;
  };

  let loading = $state(true);
  let error = $state<string | null>(null);
  let settings = $state<SiteSettings | null>(null);
  let actionMsg = $state<string | null>(null);
  let actionErr = $state<string | null>(null);
  let busy = $state(false);

  let ledgerFilter = $state('');
  let ledgerLoading = $state(false);
  let ledgerEntries = $state<LedgerEntry[]>([]);
  let ledgerTotal = $state(0);
  let ledgerErr = $state<string | null>(null);

  const tenantLabel = $derived(settings?.sitename || tenantFromHostname() || '—');
  const eventTypes = $derived(settings?.ledger?.event_types || []);
  const billing = $derived(settings?.billing || null);
  const siteQs = $derived(
    `sitename=${encodeURIComponent(tenantLabel !== '—' ? tenantLabel : '')}`,
  );
  /**
   * Absolute same-origin paths for nginx /pay (orchestrator).
   * Must leave Immich SPA — use goExternal() / <a data-sveltekit-reload>, never Button href alone.
   */
  const payHref = $derived(
    billing?.pay_path ||
      settings?.links?.pay ||
      `/pay?${siteQs}`,
  );
  const ledgerHref = $derived(
    billing?.ledger_path ||
      settings?.links?.ledger ||
      settings?.ledger?.ui_path ||
      `/pay?${siteQs}#ledger`,
  );

  /** Full navigation out of Immich SPA to nginx-proxied orchestrator pages. */
  function goExternal(path: string) {
    if (typeof window === 'undefined') return;
    window.location.assign(path);
  }

  function fmtDate(iso?: string | null) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return String(iso);
    }
  }

  async function load() {
    loading = true;
    error = null;
    try {
      await ensurePabWebAuth();
      settings = await pabFetch<SiteSettings>('/site/settings');
      void loadLedger();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      settings = null;
    } finally {
      loading = false;
    }
  }

  async function loadLedger() {
    ledgerLoading = true;
    ledgerErr = null;
    try {
      await ensurePabWebAuth();
      const q = new URLSearchParams({ per_page: '20', page: '1' });
      if (ledgerFilter) q.set('event', ledgerFilter);
      const data = await pabFetch<{ entries?: LedgerEntry[]; rows?: LedgerEntry[]; total?: number }>(
        `/ledger?${q.toString()}`,
      );
      const rows = Array.isArray(data.entries)
        ? data.entries
        : Array.isArray(data.rows)
          ? data.rows
          : [];
      ledgerEntries = rows;
      ledgerTotal = typeof data.total === 'number' ? data.total : rows.length;
    } catch (e) {
      ledgerErr = e instanceof Error ? e.message : String(e);
      ledgerEntries = [];
      ledgerTotal = 0;
    } finally {
      ledgerLoading = false;
    }
  }

  async function clearCache() {
    busy = true;
    actionMsg = null;
    actionErr = null;
    try {
      const r = await pabFetch<{ message?: string }>('/site/cache/clear', { method: 'POST' });
      actionMsg = r.message || 'Cache cleared.';
      await load();
    } catch (e) {
      actionErr = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function rebuildGeofence() {
    busy = true;
    actionMsg = null;
    actionErr = null;
    try {
      const r = await pabFetch<Record<string, unknown>>('/geofences/rebuild', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      actionMsg = `Geofence index rebuilt.`;
      if (r && typeof r === 'object') {
        actionMsg += ` ${JSON.stringify(r).slice(0, 160)}`;
      }
      await load();
    } catch (e) {
      actionErr = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void load();
  });
</script>

<UserPageLayout title="Site settings" description="Billing, ledger, cache, and geofence index for this site">
  <div class="flex h-full min-h-0 flex-col gap-4 p-3 md:p-4">
    {#if loading}
      <Text color="muted">Loading site settings…</Text>
    {:else if error}
      <div
        class="space-y-3 rounded-2xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40"
      >
        <Text class="text-red-800 dark:text-red-200">{error}</Text>
        <Text color="muted" class="block text-sm">
          Sign in to Immich as the site owner on a site host. Credentials come from Immich session → PAB web-auth.
        </Text>
        <Button size="small" onclick={() => void load()}>Retry</Button>
      </div>
    {:else}
      <div class="mx-auto w-full max-w-2xl min-h-0 flex-1">
        <section
          class="flex flex-col gap-4 overflow-auto rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-immich-dark-gray/50"
        >
          <div>
            <h2 class="text-lg font-semibold text-immich-primary dark:text-immich-dark-primary">{tenantLabel}</h2>
            <Text color="muted" class="mt-1 block text-sm">
              Owner tools for this photo site. Cache is in-process on the control plane; geofence rebuild refreshes the
              photo↔fence index.
            </Text>
          </div>

          <!-- Always-visible Pay / Ledger exits (leave Immich SPA) -->
          <div
            class="flex flex-wrap gap-2 rounded-xl border-2 border-violet-400 bg-violet-50 p-3 dark:border-violet-600 dark:bg-violet-950/40"
          >
            <a
              class="inline-flex items-center rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-violet-500"
              href={payHref}
              data-sveltekit-reload
              rel="noopener"
            >
              Pay / top up ↗
            </a>
            <a
              class="inline-flex items-center rounded-lg border border-violet-500 bg-white px-3 py-2 text-sm font-semibold text-violet-700 no-underline hover:bg-violet-100 dark:bg-immich-dark-gray dark:text-violet-200"
              href={ledgerHref}
              data-sveltekit-reload
              rel="noopener"
            >
              Full ledger UI ↗
            </a>
            <button
              type="button"
              class="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold dark:border-gray-600"
              onclick={() => goExternal(ledgerHref)}
            >
              Open ledger (force)
            </button>
          </div>

          <!-- Billing / prepaid -->
          <div
            class="rounded-xl border border-violet-200 bg-white p-3 dark:border-violet-900/50 dark:bg-immich-dark-gray"
          >
            <h3 class="text-sm font-semibold tracking-wide text-violet-700 uppercase dark:text-violet-300">
              Billing & usage
            </h3>
            {#if billing}
              <dl class="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt class="text-[0.65rem] text-gray-500 uppercase">Service ends</dt>
                  <dd class="font-semibold">{fmtDate(billing.service_ends_at)}</dd>
                </div>
                <div>
                  <dt class="text-[0.65rem] text-gray-500 uppercase">Days left</dt>
                  <dd class="font-semibold">{billing.days_left ?? '—'}</dd>
                </div>
                <div>
                  <dt class="text-[0.65rem] text-gray-500 uppercase">Est. balance</dt>
                  <dd class="font-semibold">
                    {billing.balance_usd_estimate != null ? `$${billing.balance_usd_estimate}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt class="text-[0.65rem] text-gray-500 uppercase">Status</dt>
                  <dd class="font-semibold">{billing.active ? 'active' : 'inactive'}</dd>
                </div>
                <div class="col-span-2">
                  <dt class="text-[0.65rem] text-gray-500 uppercase">Paid until / trial</dt>
                  <dd class="text-xs opacity-90">
                    paid {fmtDate(billing.paid_until)} · trial {fmtDate(billing.trial_expires_at)}
                  </dd>
                </div>
              </dl>
              {#if billing.usage_by_event?.length}
                <div class="mt-2">
                  <p class="text-[0.65rem] font-bold tracking-wide text-gray-500 uppercase">Usage by event</p>
                  <ul class="mt-1 max-h-28 space-y-0.5 overflow-auto text-xs">
                    {#each billing.usage_by_event as row}
                      <li class="flex justify-between gap-2 border-b border-gray-100 py-0.5 dark:border-gray-700">
                        <span class="truncate font-mono">{row.event}</span>
                        <span class="shrink-0 font-semibold">{row.count}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            {:else}
              <Text color="muted" class="mt-1 text-sm">Billing summary unavailable.</Text>
            {/if}
            <div class="mt-3 flex flex-wrap gap-2">
              <a
                class="inline-flex rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white no-underline"
                href={payHref}
                data-sveltekit-reload>{'Pay / top up ↗'}</a
              >
              <a
                class="inline-flex rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold no-underline dark:border-gray-600"
                href={ledgerHref}
                data-sveltekit-reload>{'Full ledger ↗'}</a
              >
            </div>
          </div>

          <!-- Ledger (inline list + external full UI) -->
          <div
            id="ledger-panel"
            class="rounded-xl border-2 border-cyan-500/60 bg-white p-3 dark:border-cyan-700 dark:bg-immich-dark-gray"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-semibold tracking-wide text-cyan-800 uppercase dark:text-cyan-300">
                Ledger
                {#if !ledgerLoading && !ledgerErr}
                  <span class="ml-1 font-mono text-xs font-normal normal-case opacity-70"
                    >({ledgerTotal})</span
                  >
                {/if}
              </h3>
              <a
                class="text-xs font-bold text-cyan-700 underline dark:text-cyan-300"
                href={ledgerHref}
                data-sveltekit-reload>Open full ledger UI ↗</a
              >
            </div>
            <p class="mt-1 text-[0.7rem] text-gray-500">
              Bookkeeping for this site (not card payments). Full page: left = ledger, right = top-up.
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <label class="text-xs text-gray-500" for="ledger-event-filter">Event type</label>
              <select
                id="ledger-event-filter"
                class="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-immich-dark-gray"
                bind:value={ledgerFilter}
                onchange={() => void loadLedger()}
              >
                <option value="">All types</option>
                {#each eventTypes as et}
                  <option value={et}>{et}</option>
                {/each}
              </select>
              <Button size="small" color="secondary" disabled={ledgerLoading} onclick={() => void loadLedger()}
                >Reload</Button
              >
            </div>
            {#if ledgerErr}
              <p class="mt-2 text-xs text-red-600">
                {ledgerErr}
                <br />
                Need site owner login. Or open
                <a class="underline" href={ledgerHref} data-sveltekit-reload>full ledger</a>.
              </p>
            {:else if ledgerLoading}
              <p class="mt-2 text-xs opacity-60">Loading ledger…</p>
            {:else if !ledgerEntries.length}
              <div class="mt-2 rounded-lg border border-dashed border-gray-300 p-3 text-xs dark:border-gray-600">
                <p class="font-semibold">No ledger entries yet for this site.</p>
                <p class="mt-1 opacity-70">
                  Rows appear when you append ledger events, voids, email breadcrumbs, or AI cost logs. You can still
                  open the full ledger / pay UI to view balances and top up.
                </p>
                <a
                  class="mt-2 inline-flex rounded-lg bg-cyan-700 px-3 py-1.5 font-semibold text-white no-underline"
                  href={ledgerHref}
                  data-sveltekit-reload>Open full ledger UI ↗</a
                >
              </div>
            {:else}
              <ul class="mt-2 max-h-52 space-y-1 overflow-auto text-xs">
                {#each ledgerEntries as e}
                  <li class="rounded border border-gray-100 px-2 py-1 dark:border-gray-700">
                    <span class="font-mono text-[0.7rem] opacity-70">{e.event || e.subject || '—'}</span>
                    {#if e.amount != null}
                      <span class="ml-1 opacity-60">amt {e.amount}</span>
                    {/if}
                    <div class="truncate">{e.description || e.subject || ''}</div>
                    <div class="opacity-50">{fmtDate(e.transaction_date)}</div>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>

          <dl class="grid grid-cols-2 gap-2">
            <div class="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-immich-dark-gray">
              <dt class="text-[0.65rem] font-bold tracking-wide text-gray-500 uppercase">Photos</dt>
              <dd class="mt-0.5 text-base font-semibold">{settings?.counts?.photos ?? '—'}</dd>
            </div>
            <div class="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-immich-dark-gray">
              <dt class="text-[0.65rem] font-bold tracking-wide text-gray-500 uppercase">Geofences</dt>
              <dd class="mt-0.5 text-base font-semibold">{settings?.counts?.geofences ?? '—'}</dd>
            </div>
            <div class="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-immich-dark-gray">
              <dt class="text-[0.65rem] font-bold tracking-wide text-gray-500 uppercase">Members</dt>
              <dd class="mt-0.5 text-base font-semibold">{settings?.counts?.members ?? '—'}</dd>
            </div>
            <div class="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-immich-dark-gray">
              <dt class="text-[0.65rem] font-bold tracking-wide text-gray-500 uppercase">Index rows</dt>
              <dd class="mt-0.5 text-base font-semibold">{settings?.counts?.geofence_index_rows ?? '—'}</dd>
            </div>
          </dl>

          <div class="flex flex-wrap gap-2">
            <Button size="small" disabled={busy} onclick={() => void clearCache()}>Clear cache</Button>
            <Button size="small" color="secondary" disabled={busy} onclick={() => void rebuildGeofence()}
              >Rebuild geofence</Button
            >
            <Button size="small" color="secondary" disabled={busy} onclick={() => void load()}>Refresh</Button>
            <a
              class="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold no-underline dark:border-gray-600"
              href={payHref}
              data-sveltekit-reload>Pay ↗</a
            >
            <a
              class="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold no-underline dark:border-gray-600"
              href={ledgerHref}
              data-sveltekit-reload>Ledger ↗</a
            >
          </div>

          {#if actionMsg}
            <p
              class="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200"
            >
              {actionMsg}
            </p>
          {/if}
          {#if actionErr}
            <p
              class="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
            >
              {actionErr}
            </p>
          {/if}
        </section>
      </div>
    {/if}
  </div>
</UserPageLayout>

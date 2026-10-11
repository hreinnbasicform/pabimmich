import { error, redirect } from '@sveltejs/kit';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';
import { Route } from '$lib/route';
import { getFormatter } from '$lib/utils/i18n';
import type { PageLoad } from './$types';

const RESERVED = new Set(['www', 'api', 'app', 'admin', 'padmin', 'mail', 'smtp', 'ftp', 'static']);

/** Leftmost DNS label for multi-tenant hosts: mysite.pab-test.example.invalid → mysite */
function siteNameFromUrl(url: URL): string | null {
  const host = (url.hostname || '').toLowerCase();
  if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split('.').filter(Boolean);
  // need at least site.domain.tld
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (!sub || RESERVED.has(sub)) return null;
  if (!/^[a-z][a-z0-9_-]{1,62}$/.test(sub)) return null;
  return sub;
}

async function assertSiteExists(sitename: string, fetchFn: typeof fetch): Promise<void> {
  // Prefer same-origin /pab-api (nginx → orchestrator). Fall back to absolute path.
  const urls = [`/pab-api/pab/site-info?name=${encodeURIComponent(sitename)}`, `/pab/site-info?name=${encodeURIComponent(sitename)}`];
  for (const u of urls) {
    try {
      const r = await fetchFn(u, { credentials: 'omit', headers: { Accept: 'application/json' } });
      if (r.status === 404) {
        error(404, { message: `Site "${sitename}" not found` });
      }
      if (r.ok) {
        const body = (await r.json().catch(() => null)) as { exists?: boolean } | null;
        if (body && body.exists === false) {
          error(404, { message: `Site "${sitename}" not found` });
        }
        return;
      }
    } catch {
      // try next URL / allow login if gate unreachable (nginx gate is primary)
    }
  }
}

export const load = (async ({ parent, url, fetch }) => {
  await parent();

  const continueUrl = Route.continue(url.searchParams.get('continue'), Route.photos());

  if (authManager.authenticated) {
    redirect(307, continueUrl);
  }

  if (!serverConfigManager.value.isInitialized) {
    // Admin not registered
    redirect(307, Route.register());
  }

  const siteName = siteNameFromUrl(url);
  if (siteName) {
    await assertSiteExists(siteName, fetch);
  }

  const $t = await getFormatter();
  const title = siteName ? `Sign in to ${siteName}` : $t('login');
  return {
    meta: {
      title,
    },
    continueUrl,
    siteName: siteName || '',
  };
}) satisfies PageLoad;

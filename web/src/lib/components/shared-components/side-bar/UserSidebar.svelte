<script lang="ts">
  import BottomInfo from '$lib/components/shared-components/side-bar/BottomInfo.svelte';
  import RecentAlbums from '$lib/components/shared-components/side-bar/RecentAlbums.svelte';
  import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
  import { resolveSidebarNav } from '$lib/extensions/resolve-sidebar-nav';
  import { contributions } from '$lib/extensions/ui-extension-points.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { Route } from '$lib/route';
  import { recentAlbumsDropdown } from '$lib/stores/preferences.store';
  import { NavbarGroup, NavbarItem } from '@immich/ui';
  import {
    mdiAccount,
    mdiAccountMultiple,
    mdiAccountMultipleOutline,
    mdiAccountOutline,
    mdiArchiveArrowDown,
    mdiArchiveArrowDownOutline,
    mdiFolderOutline,
    mdiHeart,
    mdiHeartOutline,
    mdiImageAlbum,
    mdiImageMultiple,
    mdiImageMultipleOutline,
    mdiLink,
    mdiLock,
    mdiLockOutline,
    mdiMagnify,
    mdiMap,
    mdiMapOutline,
    mdiTagMultipleOutline,
    mdiToolbox,
    mdiToolboxOutline,
    mdiTrashCan,
    mdiTrashCanOutline,
    mdiUploadOutline,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';

  /** Visible core sidebar anchors (stable ids for preferAfter / preferBefore). */
  const coreIds = $derived.by(() => {
    const ids: string[] = ['photos'];
    if (featureFlagsManager.value.search) {
      ids.push('explore');
    }
    if (featureFlagsManager.value.map) {
      ids.push('map');
    }
    // CatLink product: "Cats" nav (tag-based) replaces face People when active.
    // Avoid two similar entries for owners reviewing community cats.
    const catsReplacesPeople = contributions('sidebar.nav').some((item) => item.id === 'cats');
    if (
      !catsReplacesPeople &&
      authManager.preferences.people.enabled &&
      authManager.preferences.people.sidebarWeb
    ) {
      ids.push('people');
    }
    if (authManager.preferences.sharedLinks.enabled && authManager.preferences.sharedLinks.sidebarWeb) {
      ids.push('shared-links');
    }
    // PAB: omit core "sharing" (partner hub). Each PAB tenant is a single Immich
    // identity — partner sharing has no counterpart. Access is via PAB r/i/m/d
    // folder permissions. Public shared-links remain available above.
    ids.push('library', 'favorites', 'albums');
    if (authManager.preferences.tags.enabled && authManager.preferences.tags.sidebarWeb) {
      ids.push('tags');
    }
    if (authManager.preferences.recentlyAdded.sidebarWeb) {
      ids.push('recently-added');
    }
    if (authManager.preferences.folders.enabled && authManager.preferences.folders.sidebarWeb) {
      ids.push('folders');
    }
    ids.push('utilities', 'archive', 'locked-folder');
    if (featureFlagsManager.value.trash) {
      ids.push('trash');
    }
    return ids;
  });

  const resolvedNav = $derived(resolveSidebarNav(coreIds, contributions('sidebar.nav')));
</script>

<Sidebar ariaLabel={$t('primary')}>
  {#each resolvedNav as entry (entry.key)}
    {#if entry.kind === 'extension'}
      <NavbarItem
        title={entry.item.title}
        href={entry.item.href}
        icon={entry.item.icon}
        activeIcon={entry.item.activeIcon}
      />
    {:else if entry.id === 'photos'}
      <NavbarItem
        title={$t('photos')}
        href={Route.photos()}
        icon={mdiImageMultipleOutline}
        activeIcon={mdiImageMultiple}
      />
    {:else if entry.id === 'explore'}
      <NavbarItem title={$t('explore')} href={Route.explore()} icon={mdiMagnify} />
    {:else if entry.id === 'map'}
      <NavbarItem title={$t('map')} href={Route.map()} icon={mdiMapOutline} activeIcon={mdiMap} />
    {:else if entry.id === 'people'}
      <NavbarItem title={$t('people')} href={Route.people()} icon={mdiAccountOutline} activeIcon={mdiAccount} />
    {:else if entry.id === 'shared-links'}
      <NavbarItem title={$t('shared_links')} href={Route.sharedLinks()} icon={mdiLink} />
    {:else if entry.id === 'sharing'}
      <NavbarItem
        title={$t('sharing')}
        href={Route.sharing()}
        icon={mdiAccountMultipleOutline}
        activeIcon={mdiAccountMultiple}
      />
    {:else if entry.id === 'library'}
      <NavbarGroup title={$t('library')} size="tiny" />
    {:else if entry.id === 'favorites'}
      <NavbarItem title={$t('favorites')} href={Route.favorites()} icon={mdiHeartOutline} activeIcon={mdiHeart} />
    {:else if entry.id === 'albums'}
      <NavbarItem
        title={$t('albums')}
        href={Route.albums()}
        icon={{ icon: mdiImageAlbum, flipped: true }}
        bind:expanded={$recentAlbumsDropdown}
      >
        {#snippet items()}
          <span in:fly={{ y: -20 }} class="hidden md:block">
            <RecentAlbums />
          </span>
        {/snippet}
      </NavbarItem>
    {:else if entry.id === 'tags'}
      <NavbarItem title={$t('tags')} href={Route.tags()} icon={{ icon: mdiTagMultipleOutline, flipped: true }} />
    {:else if entry.id === 'recently-added'}
      <NavbarItem
        title={$t('recently_added')}
        href={Route.recentlyAdded()}
        icon={{ icon: mdiUploadOutline, flipped: true }}
      />
    {:else if entry.id === 'folders'}
      <NavbarItem title={$t('folders')} href={Route.folders()} icon={{ icon: mdiFolderOutline, flipped: true }} />
    {:else if entry.id === 'utilities'}
      <NavbarItem title={$t('utilities')} href={Route.utilities()} icon={mdiToolboxOutline} activeIcon={mdiToolbox} />
    {:else if entry.id === 'archive'}
      <NavbarItem
        title={$t('archive')}
        href={Route.archive()}
        icon={mdiArchiveArrowDownOutline}
        activeIcon={mdiArchiveArrowDown}
      />
    {:else if entry.id === 'locked-folder'}
      <NavbarItem title={$t('locked_folder')} href={Route.locked()} icon={mdiLockOutline} activeIcon={mdiLock} />
    {:else if entry.id === 'trash'}
      <NavbarItem title={$t('trash')} href={Route.trash()} icon={mdiTrashCanOutline} activeIcon={mdiTrashCan} />
    {/if}
  {/each}

  <BottomInfo />
</Sidebar>

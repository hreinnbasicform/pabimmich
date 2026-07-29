import type { SidebarNavItem, SidebarRenderContext } from '$lib/extensions/ui-extension-points.svelte';

export type ResolvedNavEntry =
  | { kind: 'core'; id: string; key: string }
  | { kind: 'extension'; item: SidebarNavItem; key: string };

const idOf = (entry: ResolvedNavEntry): string => (entry.kind === 'core' ? entry.id : entry.item.id);

const byOrderThenId = (a: SidebarNavItem, b: SidebarNavItem) => {
  const orderDiff = (a.order ?? 100) - (b.order ?? 100);
  if (orderDiff !== 0) {
    return orderDiff;
  }
  return a.id.localeCompare(b.id);
};

const findLastIndex = (entries: ResolvedNavEntry[], id: string) => {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (idOf(entries[i]) === id) {
      return i;
    }
  }
  return -1;
};

/**
 * Interleave extension nav items into a list of visible core sidebar ids.
 * - preferAfter / preferBefore place relative to anchors
 * - preferMissing: 'skip' drops the item when the anchor is missing; default appends at end
 * - onBeforeRender returning false skips the item
 */
export function resolveSidebarNav(coreIds: string[], items: SidebarNavItem[]): ResolvedNavEntry[] {
  const result: ResolvedNavEntry[] = coreIds.map((id) => ({ kind: 'core', id, key: `core:${id}` }));

  const pending = [...items].filter((item) => (item.when ? item.when() : true)).sort(byOrderThenId);

  for (const item of pending) {
    const visibleIds = result.map(idOf);
    const ctx: SidebarRenderContext = { visibleIds };
    if (item.onBeforeRender?.(ctx) === false) {
      continue;
    }

    const entry: ResolvedNavEntry = { kind: 'extension', item, key: `ext:${item.id}` };

    if (item.preferAfter) {
      let idx = findLastIndex(result, item.preferAfter);
      if (idx >= 0) {
        // Keep order among siblings: append after any already-placed extensions for the same anchor.
        while (idx + 1 < result.length) {
          const next = result[idx + 1];
          if (next.kind !== 'extension' || next.item.preferAfter !== item.preferAfter) {
            break;
          }
          idx++;
        }
        result.splice(idx + 1, 0, entry);
        continue;
      }
      if (item.preferMissing === 'skip') {
        continue;
      }
      result.push(entry);
      continue;
    }

    if (item.preferBefore) {
      const idx = result.findIndex((e) => idOf(e) === item.preferBefore);
      if (idx >= 0) {
        result.splice(idx, 0, entry);
        continue;
      }
      if (item.preferMissing === 'skip') {
        continue;
      }
      result.push(entry);
      continue;
    }

    result.push(entry);
  }

  return result;
}

import { resolveSidebarNav } from '$lib/extensions/resolve-sidebar-nav';
import type { SidebarNavItem } from '$lib/extensions/ui-extension-points.svelte';

const item = (partial: Partial<SidebarNavItem> & Pick<SidebarNavItem, 'id'>): SidebarNavItem => ({
  title: partial.title ?? partial.id,
  href: partial.href ?? `/${partial.id}`,
  ...partial,
});

describe('resolveSidebarNav', () => {
  const core = ['photos', 'map', 'people', 'sharing', 'favorites'];

  it('appends items without prefer* at the end', () => {
    const resolved = resolveSidebarNav(core, [item({ id: 'extra', order: 10 })]);
    expect(resolved.map((e) => (e.kind === 'core' ? e.id : e.item.id))).toEqual([
      'photos',
      'map',
      'people',
      'sharing',
      'favorites',
      'extra',
    ]);
  });

  it('places preferAfter people immediately after people', () => {
    const resolved = resolveSidebarNav(core, [
      item({ id: 'animals', preferAfter: 'people', order: 10 }),
      item({ id: 'geofencing', preferAfter: 'map', order: 10 }),
    ]);
    expect(resolved.map((e) => (e.kind === 'core' ? e.id : e.item.id))).toEqual([
      'photos',
      'map',
      'geofencing',
      'people',
      'animals',
      'sharing',
      'favorites',
    ]);
  });

  it('places preferBefore map immediately before map', () => {
    const resolved = resolveSidebarNav(core, [item({ id: 'before-map', preferBefore: 'map' })]);
    expect(resolved.map((e) => (e.kind === 'core' ? e.id : e.item.id))).toEqual([
      'photos',
      'before-map',
      'map',
      'people',
      'sharing',
      'favorites',
    ]);
  });

  it('preferAfter wins over preferBefore when both set', () => {
    const resolved = resolveSidebarNav(core, [
      item({ id: 'both', preferAfter: 'people', preferBefore: 'map' }),
    ]);
    expect(resolved.map((e) => (e.kind === 'core' ? e.id : e.item.id))).toEqual([
      'photos',
      'map',
      'people',
      'both',
      'sharing',
      'favorites',
    ]);
  });

  it('appends at end when prefer target is missing (default)', () => {
    const resolved = resolveSidebarNav(core, [item({ id: 'orphan', preferAfter: 'does-not-exist' })]);
    expect(resolved.at(-1)).toMatchObject({ kind: 'extension', item: { id: 'orphan' } });
  });

  it('skips when prefer target is missing and preferMissing is skip', () => {
    const resolved = resolveSidebarNav(core, [
      item({ id: 'orphan', preferAfter: 'does-not-exist', preferMissing: 'skip' }),
    ]);
    expect(resolved.find((e) => e.kind === 'extension')).toBeUndefined();
  });

  it('honours onBeforeRender false', () => {
    const resolved = resolveSidebarNav(core, [
      item({
        id: 'hidden',
        preferAfter: 'people',
        onBeforeRender: () => false,
      }),
    ]);
    expect(resolved.find((e) => e.kind === 'extension')).toBeUndefined();
  });

  it('honours when: false', () => {
    const resolved = resolveSidebarNav(core, [item({ id: 'gated', when: () => false })]);
    expect(resolved.find((e) => e.kind === 'extension')).toBeUndefined();
  });

  it('sorts multiple items at the same anchor by order then id', () => {
    const resolved = resolveSidebarNav(core, [
      item({ id: 'b', preferAfter: 'people', order: 20 }),
      item({ id: 'a', preferAfter: 'people', order: 10 }),
      item({ id: 'c', preferAfter: 'people', order: 10 }),
    ]);
    const afterPeople = resolved.map((e) => (e.kind === 'core' ? e.id : e.item.id));
    const peopleIdx = afterPeople.indexOf('people');
    expect(afterPeople.slice(peopleIdx, peopleIdx + 4)).toEqual(['people', 'a', 'c', 'b']);
  });
});

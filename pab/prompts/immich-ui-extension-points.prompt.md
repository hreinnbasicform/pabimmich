# Prompt — Add lightweight UI extension points to Immich (menu-nav first)

> **How to use this file:** it is a self-contained task prompt. Run it against a **clean
> upstream Immich checkout** (`git clone https://github.com/immich-app/immich`), not the PAB
> fork. Point Claude Code (or any engineer) at that repo and paste the "Task" section. Keeping
> it clean is deliberate: the core change is meant to be submitted as a **PR to upstream Immich**,
> and the demo extension proves it works without any PAB-specific code.

---

## Why (the idea)

Immich's existing plugin system is **backend-only** (WASM workflow automation — no DOM, no UI). There
is no supported way for an add-on to contribute **UI**: a menu link, a panel, an asset action. Today the
only options are (a) fork the web app and edit shared components — high merge cost, or (b) inject
JavaScript at runtime — fragile and disallowed in serious deployments.

**Proposal: add small, generic, opt-in "extension points" to the Immich web app** — passive hooks that
do *nothing by default* and let external code contribute UI declaratively. Because each hook is generic
and inert unless something registers against it, the core diff is tiny and safe, which makes it
**upstream-mergeable on a need basis**: we add one extension point when we actually need it, contribute
it back, and keep our fork thin.

**First extension point: the sidebar navigation.** Prove the pattern by letting an add-on insert a
"**Geofencing**" link into the Immich menu that opens a view *inside* Immich — with **zero** geofence code
in core.

---

## Design principles (these are the PR's selling points to maintainers)

1. **Generic, not feature-specific.** Core learns about "a place to contribute nav items," never about
   "geofencing." No PAB/geofence strings land in upstream.
2. **Zero default behaviour change.** With no contributions registered, the UI is byte-for-byte identical.
   The render slot iterates an empty list.
3. **Minimal core diff.** Ideally: **one new file** (the registry) + **one small edit** to the sidebar
   component (~5 lines). Reviewable in a minute.
4. **Declarative + SSR-safe.** Contributions are data the component renders reactively (`$state`/runes),
   not imperative DOM mutation or lifecycle hacks. Safe under SvelteKit SSR.
5. **Typed.** Extension points and their payloads are TypeScript types, so contributions are checked.
6. **No runtime code loading in this PR.** We are adding *contribution points*, not a plugin loader.
   Extensions are ordinary modules imported at build time (or, later, a separate loader PR).

---

## The primitive — a typed UI-extension-point registry

Create **one new file**. Suggested path (adapt to the repo's conventions):

`web/src/lib/extensions/ui-extension-points.svelte.ts`

```ts
// A tiny, generic registry of UI extension points for the Immich web app.
// Core components expose named "slots"; add-ons contribute typed items to them.
// Inert by default: a slot with no contributions renders nothing.

/** A navigation entry an add-on can contribute to the sidebar. */
export interface SidebarNavItem {
  /** Stable unique id (used as the {#each} key and for de-dupe). */
  id: string;
  /** Already-localized label (the contributor owns its i18n; core adds no keys). */
  title: string;
  /** Destination — an in-app route (e.g. '/geofencing') or absolute URL. */
  href: string;
  /** MDI path string (same convention as the existing @mdi/js icons in the sidebar). */
  icon?: string;
  activeIcon?: string;
  /** Lower sorts earlier; default 100. */
  order?: number;
  /** Optional gate; item is shown only when this returns true (evaluated at render). */
  when?: () => boolean;
}

/** The set of extension points and their item types. Extend this as new slots are added. */
interface ExtensionPointMap {
  'sidebar.nav': SidebarNavItem;
}
type PointName = keyof ExtensionPointMap;

// Reactive so the sidebar re-renders if a contribution registers after first paint.
const registry = $state<{ [K in PointName]: ExtensionPointMap[K][] }>({
  'sidebar.nav': [],
});

/** Register a contribution to an extension point. Idempotent on `id`. Returns an unregister fn. */
export function contribute<K extends PointName>(point: K, item: ExtensionPointMap[K]) {
  const list = registry[point];
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
  return () => {
    const j = registry[point].findIndex((x) => x.id === item.id);
    if (j >= 0) registry[point].splice(j, 1);
  };
}

/** Read the (sorted, gated) contributions for a point — call this from the component. */
export function contributions<K extends PointName>(point: K): ExtensionPointMap[K][] {
  return [...registry[point]]
    .filter((x) => ('when' in x && x.when ? x.when() : true))
    .sort((a, b) => (('order' in a ? a.order ?? 100 : 100) - ('order' in b ? b.order ?? 100 : 100)));
}
```

> The `.svelte.ts` extension is what SvelteKit uses for modules that use runes (`$state`). If the target
> repo pins an older Svelte, use a plain store (`writable([])`) instead — same public API.

---

## Core change #1 — render contributed nav items in the sidebar (the ONLY core edit)

File (verify the exact path in the clean repo; in Immich ~v3 it is):
`web/src/lib/components/shared-components/side-bar/UserSidebar.svelte`

Add the import and a render slot. Place the slot where contributed items should appear — a dedicated
group at the end reads cleanly and keeps the diff obvious:

```svelte
<script lang="ts">
  // ...existing imports...
  import { NavbarGroup, NavbarItem } from '@immich/ui';
  import { contributions } from '$lib/extensions/ui-extension-points.svelte';
</script>

<Sidebar ariaLabel={$t('primary')}>
  <!-- ...all existing NavbarItems unchanged... -->

  <!-- Extension point: add-ons may contribute nav items here. Renders nothing when empty. -->
  {#if contributions('sidebar.nav').length}
    <NavbarGroup title={$t('extensions')} size="tiny" />
    {#each contributions('sidebar.nav') as item (item.id)}
      <NavbarItem title={item.title} href={item.href} icon={item.icon} activeIcon={item.activeIcon} />
    {/each}
  {/if}
</Sidebar>
```

Notes for the executor:
- If adding the `extensions` i18n key is undesirable for the first PR, drop the `NavbarGroup` and render
  the items bare (contributors supply their own already-localized `title`, so **no `en.json` change is
  required** for the items themselves).
- Confirm `NavbarItem`'s real prop names in the target repo (`icon`/`activeIcon`/`title`/`href`) and match
  them. The registry's field names above mirror the current sidebar usage.
- That's the whole core change: **1 new file + 1 import + 1 `{#each}` block.**

---

## Demo extension — the "Geofencing" nav link (NOT part of the upstream core PR)

This proves the hook works and shows add-on authors the pattern. Keep it in its own module so it is
trivially separable from the core PR.

`web/src/lib/extensions/examples/geofencing.extension.ts`

```ts
import { mdiMapMarkerRadiusOutline } from '@mdi/js';
import { contribute } from '$lib/extensions/ui-extension-points.svelte';

// An add-on registers its UI contributions on import. In a real add-on this module
// would live outside core and be loaded by a plugin loader (future PR); for the demo
// it is imported once from the extensions barrel below.
export function registerGeofencingExtension() {
  contribute('sidebar.nav', {
    id: 'geofencing',
    title: 'Geofencing',          // add-on-owned label; swap for $t(...) if it ships its own catalog
    href: '/geofencing',
    icon: mdiMapMarkerRadiusOutline,
    order: 60,                    // sits near Map (~50) in the list
  });
}
```

Give the link a destination so it visibly works. Add a stub route:

`web/src/routes/(user)/geofencing/+page.svelte`
```svelte
<script lang="ts">
  import { UserPageLayout } from '$lib/components/layouts';
</script>
<UserPageLayout title="Geofencing">
  <section class="p-4">
    <h1 class="text-2xl font-semibold">Geofencing</h1>
    <p class="mt-2 opacity-70">Extension-point demo — this page is contributed by an add-on, not core.</p>
    <!-- Real integration (in the PAB fork) renders the geofence map/access UI here, or embeds the
         existing PAB /geofences.html page in an <iframe> until a native component exists. -->
  </section>
</UserPageLayout>
```

**Wire the demo on (opt-in, default off).** Create a one-line barrel and import it once from the root
layout so registrations run:

`web/src/lib/extensions/index.ts`
```ts
import { registerGeofencingExtension } from './examples/geofencing.extension';

// Opt-in: only load demo/dev extensions when explicitly enabled. Off by default so the
// upstream primitive ships inert.
if (import.meta.env.VITE_UI_EXTENSIONS_DEMO === 'true') {
  registerGeofencingExtension();
}
```
Import the barrel once (e.g. top of `web/src/routes/+layout.svelte` — a side-effect import:
`import '$lib/extensions';`). With `VITE_UI_EXTENSIONS_DEMO` unset, nothing registers and the UI is
unchanged; set it to run the demo.

---

## Test plan (clean Immich repo)

```bash
git clone https://github.com/immich-app/immich.git
cd immich/web
pnpm install
# apply: the new registry file, the UserSidebar edit, the demo extension + route + barrel + layout import
VITE_UI_EXTENSIONS_DEMO=true pnpm dev      # or the repo's documented web dev command
```
Then, in the running web app (against any Immich server, or the repo's dev stack):
1. Sign in → the left sidebar shows a new **Geofencing** entry (under an "Extensions" group if kept).
2. Click it → navigates to `/geofencing` and renders the stub page.
3. Unset `VITE_UI_EXTENSIONS_DEMO` (or `pnpm build`) → the link is gone and the sidebar is identical to
   stock. This demonstrates **zero default behaviour change**.
4. Run the web unit/lint/type checks the repo defines (`pnpm check`, `pnpm lint`) — all green.

---

## Acceptance criteria

- [ ] New registry module compiles and is fully typed; `contribute` / `contributions` behave (add,
      replace-by-id, unregister, order, `when` gating).
- [ ] Sidebar renders contributed items reactively; **with no contributions the rendered DOM is
      unchanged** vs. `main` (verify by diffing a screenshot or the component output).
- [ ] Demo, gated behind `VITE_UI_EXTENSIONS_DEMO`, adds a working **Geofencing** link → `/geofencing`.
- [ ] `pnpm check` / `pnpm lint` / type-check pass; no new deps in the **core** change (the primitive uses
      only Svelte + existing `@immich/ui`/`@mdi/js`).
- [ ] The **core** diff is a single new file + a minimal `UserSidebar.svelte` edit; the demo lives in
      separate files that can be dropped from the upstream PR.

---

## How to split the PRs (upstream vs. local)

- **Upstream PR (to immich-app/immich):** *only* the primitive — `ui-extension-points.svelte.ts` + the
  `UserSidebar.svelte` render slot (+ the optional `extensions` i18n key). Title it as a generic
  "web: sidebar navigation extension point (inert by default)". In the description, lead with the three
  selling points: generic, zero-default-change, tiny diff; show the empty-slot no-op; mention it is the UI
  counterpart to the existing backend plugin system. **Do not** mention geofencing.
- **Local / PAB fork:** the demo extension + the real geofencing view. In the fork, the `/geofencing`
  route can, as a first step, **embed the existing PAB `/geofences.html` page** (map + access matrix) in an
  `<iframe>` so no geofence UI is reimplemented in Svelte — then graduate to a native component later.

---

## Scope / non-goals (keep the first PR small)

- **Not** a runtime plugin loader / marketplace (extensions are build-time imports here; a loader is a
  later, separate proposal).
- **Not** server-side events (Immich already has the backend plugin/workflow system for that).
- **Not** geofence logic in core — core stays generic.
- **Not** every UI slot at once — ship the sidebar slot, learn from review, then add the next.

## Roadmap (add each on a need basis, one small PR each)

`sidebar.nav` (this) → `asset.actions` (buttons in the asset viewer) → `asset.detail.section`
(panels in the info sidebar) → `settings.section` (a user-settings page section) → and, when a genuine
data-transform hook is needed, a minimal typed **event bus** (`emit('x', ctx)` / `on('x', handler)`) so
add-ons can *change* content, not just add nav — the same "passive event" philosophy, extended from
"contribute UI" to "observe/transform data."
```

# Web UI extension points

Lightweight, **opt-in contribution slots** for the Immich web app. Core components expose named points; add-ons register typed items. **With no contributions registered, behaviour is unchanged.**

This is the UI counterpart to Immich’s backend plugin/workflow system: declarative slots for menus and panels, not a runtime marketplace or ML hooks.

## Design principles

1. **Generic** — core learns about “a place for nav items”, never about a specific feature.
2. **Zero default change** — empty slots render nothing.
3. **Small core surface** — registry + thin render hooks in existing components.
4. **Typed** — TypeScript payloads; Svelte 5 `$state` so contributions re-render reactively.
5. **No runtime code loading here** — extensions are ordinary modules that call `contribute` at import/startup.

## Quick start

```ts
import { contribute } from '$lib/extensions';
import { mdiStarOutline } from '@mdi/js';
import MyPanel from './MyPanel.svelte';

// Sidebar link (stable id for de-dupe / unregister)
contribute('sidebar.nav', {
  id: 'my-feature',
  title: 'My feature', // already localized by the contributor
  href: '/my-feature',
  icon: mdiStarOutline,
  preferAfter: 'people', // optional: place after a core item id
  preferMissing: 'end', // or 'skip' if the anchor is not visible
  order: 10,
});

// Asset info panel section
contribute('asset.detail.section', {
  id: 'my-panel',
  order: 20,
  component: MyPanel, // props: { asset, isOwner }
});
```

Import your registration module once from app startup (e.g. root layout) so it runs.

## Extension points

| Point | Where | Payload |
|-------|--------|---------|
| `sidebar.nav` | User sidebar | `SidebarNavItem` |
| `app.branding` | Logos + favicons | `AppBranding` / `setAppBranding()` |
| `asset.detail.section` | Asset info panel (after People) | `AssetDetailSection` |
| `asset.detail.before-tags` | Above Tags | `AssetDetailSection` |
| `asset.detail.after-map` | After the map | `AssetDetailSection` |
| `asset.viewer.below` | Under the main photo | `AssetDetailSection` |

### Sidebar placement

Core items use stable ids: `photos`, `explore`, `map`, `people`, `sharing`, `library`, `favorites`, `albums`, `tags`, `recently-added`, `folders`, `utilities`, `archive`, `locked-folder`, `trash`.

| Field | Meaning |
|-------|---------|
| `preferAfter` | Insert after this id |
| `preferBefore` | Insert before this id (`preferAfter` wins if both set) |
| `preferMissing` | `'end'` (default) or `'skip'` if the anchor is missing |
| `when` / `onBeforeRender` | Gate visibility |

See `resolve-sidebar-nav.ts` and its unit tests.

### Branding

```ts
import { setAppBranding } from '$lib/extensions';

const unregister = setAppBranding({
  id: 'my-brand',
  logoIcon: '/custom-icon.svg',
  logoInline: '/custom-wordmark.svg',
  favicon: '/custom-favicon.ico',
});
// unregister() restores stock assets
```

`AppLogo` and `BrandingHead` honour the active branding contribution (highest `order`).

## Public API

From `$lib/extensions` / `ui-extension-points.svelte.ts`:

- `contribute(point, item)` → unregister function (idempotent on `id`)
- `contributions(point)` → sorted, `when`-filtered list
- `detailSections(point, { asset, isOwner })` → same + `onBeforeRender`
- `setAppBranding` / `activeBranding` / `brandingLogoSrc`

## Optional demos (this fork / local only)

Set `VITE_UI_EXTENSIONS_DEMO=true` to load example extensions under `examples/` (geofencing stub, animals-via-tags, comments under the image, branding demo). They are **not** required for the primitive and can be omitted from an upstream PR.

| Demo | Register | UI |
|------|----------|-----|
| Animals (tags) | `examples/animals.extension.ts` | `DetailPanelAnimals.svelte`, `/animals` |
| Comments under image | `examples/detail-comments.extension.ts` | `DemoAssetComments.svelte` |
| Title after map | same | `DemoAssetTitle.svelte` |
| Geofencing nav | `examples/geofencing.extension.ts` | `/geofencing` |

To change demo copy (e.g. sidebar “Animals” → “Cats”), edit the extension/UI files above — not core Immich components.

## Out of scope

- Runtime plugin marketplace / dynamic script loading
- Server-side workflows (existing Immich plugins)
- Machine learning / face recognition hooks

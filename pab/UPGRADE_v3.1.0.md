# Upgrade notes: Immich v3.0.3 → v3.1.0

**Engine pin:** Immich tag **`v3.1.0`** (`pabimmich/IMMICH_VERSION`).

**UI extensions:** Ported from `c:\projects\pabimmich\web\src\lib\extensions` so we
can extend Immich without more hard edits. Product branding uses
`setAppBranding` (not hardcoded nav SVG).

## What changed

| Area | v3.0.3 (previous) | v3.1.0 (this PR) |
|------|-------------------|------------------|
| Pin | `v3.0.3` | `v3.1.0` |
| Fork image | `pab/immich-server:v3.0.3-pab` | `pab/immich-server:v3.1.0-pab` |
| Nav logo | Hardcoded SVG in `NavigationBar` | `AppLogo` + `app.branding` extension |
| Hide Sharing | Comment-out partner nav | Omit `'sharing'` from `coreIds` |
| UI extensions | Not present | `web/src/lib/extensions/**` |
| pnpm | 11.6.0 | 11.13.1 |

## PAB deltas re-applied

1. **`docker/docker-compose.yml`** — `127.0.0.1:2283` loopback bind.
2. **`docker/docker-compose.override.yml`** — `pab/immich-server:v3.1.0-pab`.
3. **`hooks.client.ts` + `pab-error-reporter.ts`** — JS errors → orchestrator.
4. **`UserSidebar.svelte`** — no core `sharing` id.
5. **`NavigationBar.svelte`** — site name chip next to `AppLogo` (logo itself via extension).
6. **`+layout.svelte`** — title `PhotoAppBackend`; loads `$lib/extensions` + `BrandingHead`.
7. **`extensions/pab/branding.extension.ts`** — always-on product branding → `/pab-logo.svg`.
8. **`web/static/manifest.json` (+ favicons)** — PAB PWA metadata.
9. **Optional demos** — `VITE_UI_EXTENSIONS_DEMO` / `VITE_PAB_EXTENSIONS`.

## Conflict flags

### 🔴 High — re-verify orchestrator against live API

`ORCHESTRATOR_CONTRACT.md` still describes verified **v3.0.3** behaviour. Two new
DB migrations + search schema work in 3.1.0. Smoke-test before production.

### 🟠 Medium — branding path

- Logos: `setAppBranding` + static `/pab-logo.svg` + `AppLogo` / `BrandingHead`.
- Legacy `apply_branding.py` + `branding.css` **removed** (SB8, 2026-07-31) — use
  `branding.extension.ts` / `theme-branding.json` only (no Immich customCss double-brand).
- Rebuild required for web changes.

### 🟠 Medium — compose / deploy

Keep loopback bind. Recreate only `immich-server` after image rebuild.
Migrations run on first boot of 3.1.0.

### 🟡 Low

- Mobile/OpenAPI drift (we don't ship mobile).
- `pab-logo.svelte` removed (use `AppLogo` only).
- Makefile shim retained.

## Deploy checklist

1. `mise run plugins` + build.
2. Tag `pab/immich-server:v3.1.0-pab`, recreate only `immich-server`.
3. `GET /api/server/version` → 3.1.0.
4. Loopback only on :2283.
5. UI: PAB logo via extension, site name, no Sharing hub, title suffix.
6. Optional: `VITE_UI_EXTENSIONS_DEMO=true` shows demo nav items.
7. Orchestrator smoke + rewrite contract pins after verify.

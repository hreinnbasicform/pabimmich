# PhotoAppBackend — Immich fork maintenance

We fork and modify Immich to optimize the backend-web UX for PAB. We deliberately
**drop strict upstream compatibility** but still want to pull upstream **security
fixes**. This file is the operating manual for that.

## Status

- `pabimmich/` is **vendored into this repo and tracked**, base = Immich tag
  **`v3.1.0`** (`pabimmich/IMMICH_VERSION`).
- **UI extension points** live under `web/src/lib/extensions/` (registry +
  `AppLogo` / `BrandingHead` / resolved sidebar). Product branding is always on
  via `extensions/pab/branding.extension.ts`. Optional demos gated by
  `VITE_UI_EXTENSIONS_DEMO` / `VITE_PAB_EXTENSIONS`.
- Excluded from git (see root `.gitignore`): `node_modules/`, the live runtime
  volumes `docker/postgres-prod/` + `docker/library-prod/`, all `.env`, and build
  artifacts (`packages/*/dist`, `web/.svelte-kit`, coverage, `.pnpm-store/`).

See **`pab/UPGRADE_v3.1.0.md`** for the 3.0.3 → 3.1.0 conflict analysis.

## Pulling an upstream security fix

Prefer a pure Immich tag, re-vendor, then re-apply the small PAB list below
(extension core files may conflict — resolve carefully).

Keep the version pin, the compose image tags, and `IMMICH_VERSION` in lockstep.

## Editing discipline (keeps merges trivial)

**Prefer the extension registry** over hard-editing core:

| Goal | How |
|------|-----|
| Logo / favicons | `setAppBranding` in `web/src/lib/extensions/pab/branding.extension.ts` |
| Sidebar items | `contribute('sidebar.nav', …)` from a new module under `extensions/` |
| Asset detail panels | `contribute('asset.detail.*', …)` |
| Always-on product code | import from `extensions/index.ts` (or `VITE_PAB_EXTENSIONS`) |

**Put additive PAB code in NEW files** — `pab/`, `web/src/lib/extensions/pab/`,
new routes. The only core files we should ever touch, and only minimally
(comment `// PAB:`):

| File | Why we touch it |
|------|-----------------|
| `server/src/enum.ts` | register a new QueueName / JobName |
| `server/src/services/job.service.ts` | add a PAB step to the ML fan-out |
| `server/src/app.module.ts` | register a PAB service |
| `web/.../NavigationBar.svelte` | site name chip next to `AppLogo` only |
| `web/.../UserSidebar.svelte` | omit partner `sharing` from `coreIds` |
| `web/src/hooks.client.ts` | wire `pab-error-reporter` |
| `web/src/routes/+layout.svelte` | document title suffix (+ loads extensions) |
| `docker/docker-compose.yml` | loopback bind for :2283 |

Do **not** hardcode SVG into NavigationBar — logos go through `app.branding`.

## Building the modified fork

```sh
cd pabimmich
mise run plugins          # REQUIRED first
mise run dev
# prod image:
#   docker build -f server/Dockerfile -t pab/immich-server:v3.1.0-pab .
```

Optional env for demos:

```sh
# VITE_PAB_EXTENSIONS=true        # activities/ledger sidebar entry
# VITE_UI_EXTENSIONS_DEMO=true    # animals, geofencing, comments demos
```

## Deploying UI without a full Docker rebuild

Extensions that change often live **outside** the image under host-mounted www:

| Host path | Container | Purpose |
|-----------|-----------|---------|
| `/opt/pab/immich/www` | `/build/www` | Full SvelteKit web build |
| `/opt/pab/immich/www/pab-ui` | `/pab-ui/*` | External scripts (custom elements) |

```sh
# Comments / external panels only (no build, no restart):
./scripts/deploy-pab-ui.sh root@159.69.32.108

# Core Svelte / extension host changed (web stage only, remount www):
./scripts/deploy-immich-web.sh root@159.69.32.108

# Full image (server + web + plugins) — rare:
#   docker build -f server/Dockerfile -t pab/immich-server:v3.1.0-pab-amd64 .
```

See `pabimmich/pab-ui/README.md` and `docker/docker-compose.override.yml`.

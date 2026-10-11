# External JS / Network Audit — Vendored Immich Web App

**Scope:** `/Users/bonus/repos/photoappbackend/pabimmich/web` (SvelteKit + Vite web client)
**Date:** 2026-07-27
**Question:** What JavaScript is loaded at runtime from a host other than the app's own origin?
**Method:** Source audit (authoritative). No local `build/` output and no built `www/` present in the docker image dir, so findings are from `web/src` + `web/static`. All paths below are relative to `pabimmich/web/`.

---

## Externally hosted JS at runtime (the direct answer)

**Exactly ONE** externally-hosted script is loaded at runtime, and it is opt-in / disabled by default:

### 1. Google Cast sender framework (gstatic.com)
- **File:** `src/lib/utils/cast/gcast-destination.svelte.ts:6`
  ```
  const FRAMEWORK_LINK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  ```
- **How it loads:** lines 48–51 create a `<script>` element with `script.src = FRAMEWORK_LINK` and append it to `document.body` — i.e. a third-party script injected into the page and executed at runtime.
- **Host:** `www.gstatic.com` (Google).
- **Gating (NOT loaded by default):** `initialize()` returns early at line 28 unless
  `authManager.authenticated && authManager.preferences.cast.gCastEnabled`.
  The default for `gCastEnabled` is **`false`** (`src/test-data/factories/preferences-factory.ts:9`; user opts in via onboarding `OnboardingUserPrivacy.svelte` or `user-settings/FeatureSettings.svelte`). So this gstatic script only loads for an authenticated user who has explicitly enabled Google Cast.
- Note: `import 'chromecast-caf-sender';` on line 1 is a **types-only** dev package (`@types/chromecast-caf-sender`, `package.json:87`) — it ships no runtime JS. The actual runtime code is the gstatic script above.

That is the only third-party-hosted JS. Everything else the app runs is same-origin/bundled.

---

## External network calls (non-JS) — privacy relevant

These reach third-party hosts at runtime but transfer **data, not executable JS**:

### A. Paid-license activation → `pay.futo.org`
- **File:** `src/lib/utils/license-utils.ts:18`
  ```
  const response = await fetch(new URL(`/api/v1/activate/${licenseKey}`, PUBLIC_IMMICH_PAY_HOST).href);
  ```
- Host default: `https://pay.futo.org` (`svelte.config.js:8`, `PUBLIC_IMMICH_PAY_HOST`).
- Fires only when a user activates an Immich paid license (sends the license key to FUTO's pay server, returns an activation key). Not triggered in normal browsing.

### B. Buy-license link → `buy.immich.app`
- **File:** `src/lib/utils/license-utils.ts:26–29` (`getLicenseLink`) builds
  `https://buy.immich.app/?productId=...&instanceUrl=<externalDomain||origin>`.
- Host default: `https://buy.immich.app` (`svelte.config.js:7`, `PUBLIC_IMMICH_BUY_HOST`).
- This is a user-initiated navigation/href (purchase page), not an automatic fetch. Note it does put the instance's `externalDomain`/origin in a query param when the user clicks buy.

### C. Map tiles / style JSON
- **File:** `src/lib/components/shared-components/map/Map.svelte:107–108, 278`
  ```
  const styleUrl = $derived(mapTheme === Theme.Dark
    ? serverConfigManager.value.mapDarkStyleUrl
    : serverConfigManager.value.mapLightStyleUrl);
  map?.setStyle(styleUrl, {...});
  ```
- The style URL comes from **server config** (`mapDarkStyleUrl` / `mapLightStyleUrl`), served by the app's own Immich server by default. Tiles use the local `pmtiles` protocol via `maplibre-gl` (bundled). This becomes an external call **only if an admin configures an external style/tile provider**; the default is self-hosted. (maplibre-gl and pmtiles are bundled npm deps, not external JS.)

### D. Same-origin only (for completeness)
- Cast media probe `fetch(mediaUrl, { method: 'HEAD' })` (`gcast-destination.svelte.ts:106`) targets the app's own asset URL.
- Service worker (`src/service-worker/index.ts:27`) only intercepts/`fetch`es **same-origin** asset requests (`url.origin === self.location.origin`); no `importScripts`, no cross-origin fetch.

---

## Bundled (local) JS

The app compiles all of its JavaScript locally via **Vite / SvelteKit** and serves it from its own origin. Notable points that could be mistaken for external loads but are NOT:

- **Fonts named "GoogleSans" / "GoogleSansCode" are self-hosted local files**, not Google Fonts. They are imported as local assets:
  `src/hooks.server.ts:2–3` → `import GoogleSans from '$lib/assets/fonts/GoogleSans/GoogleSans.ttf?url'` (and the mono variant), then spliced into `%app.font%` / `%app.monofont%` in `app.html:16–17`. The `crossorigin="anonymous"` on those `<link rel=preload>` tags is standard for font preloads and does not imply an external host.
- **Web worker is local:** `src/lib/utils/file-uploader.ts:132` — `new Worker(new URL('$lib/workers/hash-file.ts', import.meta.url), { type: 'module' })` (bundled, same-origin).
- `app.html:84` loads `<link rel="stylesheet" href="/custom.css">` — same-origin CSS (admin custom styling), no JS.
- npm packages (maplibre-gl, pmtiles, luxon, socket.io/engine.io-client, etc.) are bundled at build time — being an npm dependency is **not** external hosting. The `xmlhttprequest-ssl` alias in `vite.config.ts:29` is a build-time module resolution shim, not a runtime remote load. The `immich-server:2283` target in `vite.config.ts:10` is the **dev-server proxy** only.
- No `eval(...)`, no `new Function(...)`, no `import()` of a remote URL anywhere in `src`.

---

## Phone-home / telemetry

- **No analytics/telemetry SDKs.** No Sentry, PostHog, Plausible, Matomo, Google Analytics / gtag / Tag Manager, Segment, Mixpanel, Amplitude, Datadog, etc. anywhere in `src` or `static`. (The `.track(...)` calls in `file-uploader.ts` are an internal upload-progress store, not analytics.)
- **Version / new-release check is NOT done by the web client directly.** The web app receives release/version info over its **WebSocket from its own server**:
  `src/lib/stores/websocket.ts:69` (`on_server_version`) and `:80` (`on_new_release` → `ReleaseEvent`), surfaced by `release-manager.svelte.ts`.
  For admins, `src/lib/components/sidebar/side-bar/ServerStatus.svelte:52` builds a `https://github.com/immich-app/immich/releases/tag/<version>` **href** (a clickable link, not a fetch). The actual GitHub release check that "phones home" happens **server-side** in the Immich server, not in this web client.
- **Outbound hosts found in source are documentation / help hyperlinks** (user-initiated `href`s), not automatic code loads or beacons: e.g. `github.com/immich-app/immich`, `docs.immich.app`, `discord.immich.app`, `crontab.guru`, `trac.ffmpeg.org`, `stackoverflow.com`, `svelte.dev`, `openstreetmap.org`, `backblaze.com`, `apps.apple.com`, `play.google.com`, `f-droid.org`, `huggingface.co`. `static/.well-known/security.txt` and `static/robots.txt` contain only informational URLs. `my.immich.server` / `malicious.site` / `example.com` are placeholder/test strings.

---

## Recommendation

- **Bottom line: the app's JavaScript is self-hosted.** The only third-party-hosted script that can execute at runtime is Google's Cast sender (`www.gstatic.com/cv/js/sender/v1/cast_sender.js`), and it is **off by default** — it loads only for an authenticated user who explicitly enables Google Cast. For a privacy-hardened multi-tenant deployment, if you don't want any gstatic dependency you can disable/remove the Google Cast feature (default preference `gCastEnabled: false` already prevents the load; you could also drop `gcast-destination.svelte.ts` entirely or block the host at CSP).
- **Consider a Content-Security-Policy** that whitelists `'self'` for `script-src` (plus `https://www.gstatic.com` only if Cast is wanted) — this both documents and enforces the "self-hosted JS" property and would catch any future regression.
- **License endpoints (`pay.futo.org`, `buy.immich.app`)** only fire on explicit paid-license actions; if paid licensing is unused in this deployment, these code paths are never exercised. `buy.immich.app` link leaks the instance domain in a query param on click — cosmetic, user-initiated.
- **Map style URL is admin-controlled** (`mapDarkStyleUrl`/`mapLightStyleUrl`); keep it pointed at the self-hosted style to avoid an external tile provider seeing user map activity.

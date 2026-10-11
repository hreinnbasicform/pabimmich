# PAB UI extensions (host-mounted)

These files are **outside** the Immich Docker image. Immich loads them at runtime from:

```text
/pab-ui/manifest.json
/pab-ui/*.js
```

On the server that path is:

```text
/opt/pab/immich/www/pab-ui/   →  mounted into container  /build/www/pab-ui
```

(or only `/opt/pab/immich/pab-ui` → `/build/www/pab-ui` if you prefer a dedicated volume).

## Update without rebuilding Immich

```bash
# from repo root
./scripts/deploy-pab-ui.sh root@159.69.32.108

# then hard-refresh the browser (Ctrl+Shift+R)
```

No `docker build`, no container restart required for JS-only changes (custom elements are loaded with `cache: 'no-store'` on the manifest).

## Browser config for comments

**Auto-detected** on site hosts (`<sitename>.domain`):

| Setting | Source |
|---------|--------|
| API base | same-origin `/pab-api` (nginx → orchestrator; **never :8100**) |
| Tenant | first DNS label (`catlinkv2.pab-test.example.invalid` → `catlinkv2`) |
| Error log | same-origin `/client-errors` |

**Auth is automatic** when signed into Immich:

1. Browser calls `GET /pab-api/web-auth` with the `immich_access_token` cookie  
2. Orchestrator validates the Immich user is bound to this site  
3. Returns a short-lived `pabw.…` token (stored as `pab_passport`)  

No site-create passport paste. If you see “Sign in to the photo library…”, log into Immich first.

Photos must be uploaded through the PAB API so `engine_asset_id` links Immich `asset.id` → PAB `photo_hash`.

## Manifest

```json
{
  "version": "v8-site-scripts",
  "scripts": ["site-scripts.js", "asset-comments-v4.js"],
  "pages": ["site-settings.html", "abbot.html"],
  "config": ["site-scripts-config.json"]
}
```

Add more scripts in `scripts`. Each may define custom elements or call into the page.

## Site scripts (gtag + header / footer overrides)

Immich extension: `web/src/lib/extensions/pab/site-scripts.extension.ts` loads host-mounted:

| File | Role |
|------|------|
| `site-scripts.js` | Injects scripts into **header** (`<head>`) and **footer** (`#pab-site-scripts-footer`) |
| `site-scripts-config.json` | Default + host overrides (no Immich rebuild) |

**Default:** Google tag `G-Q0R7L2RJKH` in the header.

### Override without rebuild

1. **Edit config on the host** (`/opt/pab/immich/www/pab-ui/site-scripts-config.json`):

```json
{
  "enabled": true,
  "gtagId": "G-Q0R7L2RJKH",
  "header": [
    { "id": "gtag", "type": "gtag" },
    { "id": "extra", "src": "https://example.com/a.js", "async": true }
  ],
  "footer": [
    { "id": "pixel", "html": "<script>/* … */</script>" }
  ]
}
```

2. **Runtime object** (before load):

```html
<script>
  window.__PAB_SITE_SCRIPTS_OVERRIDE__ = {
    gtagId: "G-OTHER",
    appendFooter: [{ id: "chat", src: "https://…" }]
  };
</script>
```

3. **JS API** after load:

```js
PabSiteScripts.setGtagId('G-…');           // or null to disable gtag
PabSiteScripts.setHeader([{ id: 'gtag', type: 'gtag' }, { id: 'x', src: '…' }]);
PabSiteScripts.setFooter([{ id: 'f', html: '<script>…</script>' }]);
PabSiteScripts.appendFooter({ id: 'y', src: '…' });
PabSiteScripts.configure({ enabled: false }); // strip all
PabSiteScripts.apply();
```

Keys: `header` / `footer` replace lists; `appendHeader` / `appendFooter` / `replaceHeader` / `replaceFooter` in override objects.

## Theme logos (light / dark)

Config: **`theme-branding.json`** (host: `/pab-ui/theme-branding.json`, also bundled as `/theme-branding.json`).

| Field | Meaning |
|-------|---------|
| `follow_theme` | `true` (default): Immich/html `dark` class → `styles.dark`, else `styles.light` |
| `logo_style` | Forced style when `follow_theme` is `false`: `"dark"` \| `"light"` |
| `styles.dark` | White monogram (`logo-c-aperture-p_white.*`) — **default** |
| `styles.light` | Color monogram on transparent (`logo-c-aperture-p_transparent.*`) |

Assets live under `/pab-ui/brand/` and `/brand/` (web static).

Runtime (after Immich web build with branding extension):

```js
PabThemeBranding.setLogoStyle('dark')   // force white
PabThemeBranding.setLogoStyle('light')  // force color
PabThemeBranding.setFollowTheme(true)
PabThemeBranding.reload()
```

`site-scripts.js` also swaps favicons when the theme class changes (no rebuild required).

## Site settings + Abbot (Immich extensions)

| Surface | Path |
|---------|------|
| **Sidebar (extension)** | `web/src/lib/extensions/pab/site-settings.extension.ts` → `/pab/abbot`, `/pab/site-settings` |
| **Account Settings** | `web/src/lib/extensions/pab/user-settings.extension.ts` — bare-min sections, hide Purchase, Site settings accordion on `/user-settings` |
| **In-app routes** | `web/src/routes/(user)/pab/abbot`, `…/pab/site-settings` — `UserPageLayout` inside Immich `<main>` |
| Actions | Clear cache → `POST /pab-api/site/cache/clear`; rebuild → `POST /pab-api/geofences/rebuild` |
| Abbot (standalone) | `/pab/abbot` (sidebar); iframe → same-origin `/abbot/?embed=1` (nginx → Abbot :8200). Not embedded in Site settings. |
| Static fallback only | `/pab-ui/abbot.html`, `/pab-ui/site-settings.html` |

Note: nginx `location /abbot/` is the **chatbot proxy** (iframe). In-app Immich pages use `/pab/*` so they are not shadowed.

**Deploy in-app routes / sidebar:** `./scripts/deploy-immich-web.sh` (web rebuild).  
**Deploy comments CE only:** `./scripts/deploy-pab-ui.sh` (no rebuild).

## One-time Immich image requirement

The image must include the **thin host** (`AssetComments.svelte` + `runtime-loader.ts`) that loads `/pab-ui/`. After that lands once, extension UI iterates only via this folder.

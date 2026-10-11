# PAB <-> Immich Orchestrator Contract (was Immich v3.0.3 — **re-verify on v3.1.0**)

> **Upgrade flag (v3.1.0):** The vendored engine is now **v3.1.0** (`IMMICH_VERSION`,
> OpenAPI info.version). Claims below were verified against **v3.0.3**. Do not treat
> this file as authoritative until the deploy checklist in `pab/UPGRADE_v3.1.0.md` is
> completed and version pins in this doc are rewritten.

This is the single reference for implementing `immichClient.js` against the live Immich
stack. Every claim below was verified against the running server at
`http://127.0.0.1:2283` (docker compose project `immich-prod`, image
`ghcr.io/immich-app/immich-server:v3.0.3`, sourceCommit
`cd308ad93093735135f99d85ce6980c8e93df231`) and/or the pinned OpenAPI spec at
`pabimmich/open-api/immich-openapi-specs.json` (info.version was 3.0.3). You should not need
to read Immich source.

---

## 1. Overview: engine model

- **Shared instance, multi-tenant by user.** One Immich deployment serves all PAB sites.
  Each PAB site maps to exactly **one non-admin Immich user** plus **one API key owned by
  that user**. All site photo traffic uses that per-site key; the site never sees the
  admin key.
- **Base URL:** `http://127.0.0.1:2283`. The OpenAPI spec's `servers[].url` is `/api`, so
  every spec path is prefixed: **live API base = `http://127.0.0.1:2283/api`**.
- **Health check:** `GET /api/server/ping` — public, no auth. Expected: `200` with body
  exactly `{"res":"pong"}`.
- **Version pin check (public):** `GET /api/server/version` -> `200`
  `{"major":3,"minor":0,"patch":3,"prerelease":null}`. Treat any other version as a
  deployment error (this contract is v3.0.3-specific; several v2-era fields are gone).
- **Never** manage the containers from orchestrator code. The stack is shared; interact
  over HTTP only.

Stack containers (for debugging context only): `immich_server`, `immich_postgres`
(postgres 14 + vectorchord), `immich_machine_learning`, `immich_redis` (valkey 9).

## 2. Auth

Two interchangeable schemes; nearly every authenticated endpoint accepts either:

| Scheme | How | When to use |
|---|---|---|
| API key | header `x-api-key: <secret>` | Normal path. Admin ops use the admin key; per-site ops use the site's key. |
| Session | `Authorization: Bearer <accessToken>` from `POST /api/auth/login` | Only needed to act as a user that has no API key yet — i.e. once per tenant, to mint the tenant's key (see 3.5). |

(A cookie scheme `immich_access_token` also exists; ignore it.)

- **Admin key source:** the env file `/Users/bonus/repos/photoappbackend/.env`, variable
  **`IMMICH_API_KEY`** (gitignored). Load it at runtime; never log it, never commit it,
  never bake it into generated files. In shell examples below it is assumed exported:
  `export IMMICH_API_KEY=...` (value comes from `.env`).
- The admin key belongs to the admin user `pab-admin@basicform.org`
  (id `bcd9ed69-a28b-4a06-b735-2e29ce6b4b89`, `isAdmin: true`) and carries full admin
  scope — verified against `/api/admin/users`, `/api/system-config`, `/api/jobs`,
  `/api/queues/*`, etc.
- **Key-scope rule (v3.0.3):** a caller authenticated **with an API key** can only grant
  permissions that key already holds (`400 Bad Request: "Cannot grant permissions you do
  not have"`). Session (Bearer) auth has no such restriction.
- **Auth errors:** missing/bad auth -> `401`; valid key lacking a permission -> `403`
  with body exactly `{"message": "Missing required permission: <permission>"}` — there
  is no separate `missingPermission` field; the permission name appears only inside the
  message string (verified live). Note Immich uses `400` (not `404`) for
  "not found or not yours" on assets: `{"message":"Not found or no asset.read access"}`
  (verified live).

## 3. Endpoint reference (lifecycle operations)

All paths below are relative to `http://127.0.0.1:2283/api`. All JSON bodies require
`Content-Type: application/json`. `$IMMICH_API_KEY` = admin key; `$TENANT_KEY` = a
per-site key.

### 3.1 Admin sign-up (first boot only)

- `POST /api/auth/admin-sign-up` — no auth (public). Only succeeds while **no admin
  exists**; on the live stack this is already consumed and now returns `400`.
- Request JSON (all required): `{"email": "...", "name": "...", "password": "..."}`
- Success: `201` `UserAdminResponseDto` — `{id, email, name, isAdmin, status, createdAt,
  updatedAt, deletedAt, avatarColor, license, oauthId, profileChangedAt,
  profileImagePath, quotaSizeInBytes, quotaUsageInBytes, shouldChangePassword,
  storageLabel}`.

```bash
curl -sf -X POST http://127.0.0.1:2283/api/auth/admin-sign-up \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.org","name":"Admin","password":"CHANGE_ME"}'
```

### 3.2 Login (get a Bearer session token)

- `POST /api/auth/login` — no auth.
- Request JSON (required): `{"email": "...", "password": "..."}`
- Success: `201` `LoginResponseDto`: `{accessToken, userId, userEmail, name, isAdmin,
  isOnboarded, profileImagePath, shouldChangePassword}` (all present).
- Use as `Authorization: Bearer <accessToken>`.

```bash
ACCESS_TOKEN=$(curl -sf -X POST http://127.0.0.1:2283/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"site-123@pab.local","password":"'$TENANT_PASSWORD'"}' | jq -r .accessToken)
```

### 3.3 Create tenant user (admin)

- `POST /api/admin/users` — admin-only (permission `adminUser.create`); admin key works.
- Request JSON `UserAdminCreateDto` — required: `email`, `name`, `password`. Optional:
  `isAdmin` (bool — leave unset/false for tenants), `quotaSizeInBytes` (int >= 0 or
  null = unlimited), `storageLabel` (string or null), `shouldChangePassword` (bool),
  `notify` (bool — attempts a notification email; the stack has email disabled, keep it
  false), `avatarColor`, `pinCode` (6-digit string or null).
- Success: `201` `UserAdminResponseDto` (same shape as 3.1). **Store `.id`** — needed for
  delete/restore/statistics.

```bash
curl -sf -X POST http://127.0.0.1:2283/api/admin/users \
  -H "x-api-key: $IMMICH_API_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"site-123@pab.local","name":"PAB site 123","password":"'$TENANT_PASSWORD'",
       "quotaSizeInBytes":10737418240,"storageLabel":"pab-site-123",
       "shouldChangePassword":false,"notify":false}'
```

Duplicate email -> `400`. List/inspect: `GET /api/admin/users[?withDeleted=true&id=<uuid>]`
-> `200` array of `UserAdminResponseDto`; `GET /api/admin/users/{id}` -> single.

### 3.4 Delete tenant user (soft + hard)

- `DELETE /api/admin/users/{id}` — admin-only (`adminUser.delete`).
- The spec marks the JSON body **required** — always send at least `{}`.
- Body `UserAdminDeleteDto`: `{"force": true|false}` (optional field).
  - **Soft (default / force absent/false):** user gets `status:"deleted"`,
    `deletedAt` set, login disabled. Actual purge happens later: a background
    `UserDeleteCheck` job hard-deletes users whose `deletedAt` is older than the
    system-config `user.deleteDelay` (**default 7 days**). Reversible until then via
    `POST /api/admin/users/{id}/restore` (empty body) -> `200`.
  - **Hard (`{"force":true}`):** user gets `status:"removing"` and a `UserDelete` job is
    queued **immediately** (background task queue). That job removes the user's on-disk
    folders (upload, library, profile, thumbs, encoded-video), deletes the user's
    albums, then deletes the DB row — **assets, EXIF, API keys, sessions all cascade**
    (FK `ON DELETE CASCADE`). Irreversible.
- Success: `200` `UserAdminResponseDto` with `deletedAt` set.
- You cannot delete your own account (`400 "Cannot delete your own account"`), so the
  admin can never delete the admin user this way.

```bash
# hard delete
curl -sf -X DELETE http://127.0.0.1:2283/api/admin/users/$USER_ID \
  -H "x-api-key: $IMMICH_API_KEY" -H 'Content-Type: application/json' \
  -d '{"force":true}'
```

### 3.5 Create an API key for a tenant user

**There is no "admin mints a key for user X" endpoint in v3.0.3.** `POST /api/api-keys`
always creates the key for the *authenticated caller* (server sets
`userId = auth.user.id`). Therefore the tenant-provisioning sequence is:

1. Admin creates the user (3.3) with a password the orchestrator generated and stored.
2. `POST /api/auth/login` as that user (3.2) -> `accessToken`.
3. `POST /api/api-keys` with `Authorization: Bearer <accessToken>`.

- Request JSON `ApiKeyCreateDto` — required: `permissions` — non-empty array of
  `Permission` enum strings. Optional: `name` (defaults to `"API Key"`).
- The `Permission` enum has 155 values in v3.0.3. `"all"` is a valid single value and is
  the simplest choice for a tenant key (allowed because step 2 uses session auth, which
  is exempt from the subset rule in section 2). If you want least-privilege instead, a
  workable tenant set is: `asset.upload`, `asset.read`, `asset.update`, `asset.delete`,
  `asset.download`, `asset.view`, `asset.statistics`, `apiKey.delete`, `map.read`,
  `timeline.read` (exact enum spellings; dot-separated, camelCase resource).
- Success: `201` `ApiKeyCreateResponseDto`:
  `{"secret": "<the actual key — shown ONLY this once>", "apiKey": {id, name,
  permissions, createdAt, updatedAt}}`. **Persist `secret` (the site's credential) and
  `apiKey.id` (needed to delete the key) immediately.** The secret can never be fetched
  again.

```bash
curl -sf -X POST http://127.0.0.1:2283/api/api-keys \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"pab-site-123","permissions":["all"]}'
```

Related: `GET /api/api-keys` (list caller's keys, no secrets), `GET /api/api-keys/me`
(info about the key being used), `PUT /api/api-keys/{id}` (rename/re-permission).

### 3.6 Delete an API key

- `DELETE /api/api-keys/{id}` — permission `apiKey.delete`; **only the owning user** can
  delete it (another user, even admin, gets `400 "API Key not found"`). Authenticate as
  the tenant (their key or a fresh Bearer login).
- Success: `204` No Content. (Hard-deleting the user (3.4) also removes their keys, so
  this call is optional during a full purge.)

```bash
curl -sf -X DELETE http://127.0.0.1:2283/api/api-keys/$KEY_ID -H "x-api-key: $TENANT_KEY"
```

### 3.7 Asset upload (multipart)

- `POST /api/assets` — permission `asset.upload`. `multipart/form-data`.
- **Required parts (v3.0.3):**
  - `assetData` — the binary file part (give it a filename).
  - `fileCreatedAt` — text field, ISO 8601 date-time (`2026-07-26T00:00:00.000Z`).
  - `fileModifiedAt` — text field, ISO 8601 date-time.
- **v3 gotcha:** `deviceAssetId` / `deviceId` from older docs are **gone** — not in the
  schema at all. Do not send them.
- Optional parts: `filename`, `isFavorite` (`"true"`/`"false"` as text), `visibility`
  (`"timeline"` | `"archive"` | `"hidden"` | `"locked"`), `duration` (videos),
  `livePhotoVideoId`, `metadata` (JSON array), `sidecarData` (second binary part, e.g.
  `.xmp`).
- Optional header: `x-immich-checksum: <SHA1 of file bytes>` — base64 **or** hex both
  accepted — lets the server short-circuit duplicates before storing the body.
- Success: `201` with `{"id":"<uuid>","status":"created"}`.
- **Duplicate handling (verified live):** re-uploading byte-identical content as the
  same user returns **`200`** (not 201) with `{"status":"duplicate","id":"<existing
  asset uuid>"}`. Checksum uniqueness is **per user** (DB unique on
  `(ownerId, checksum)`), so two different tenants can each upload the same photo.
  Treat both `created` and `duplicate` as success and use the returned `id`.
- Quota: if the user's `quotaSizeInBytes` would be exceeded, upload fails `400`
  `"Quota has been exceeded!"`.
- Pre-check endpoint (optional): `POST /api/assets/bulk-upload-check` with
  `{"assets":[{"id":"<any client tag>","checksum":"<sha1 base64|hex>"}]}`.

```bash
curl -sf -X POST http://127.0.0.1:2283/api/assets \
  -H "x-api-key: $TENANT_KEY" \
  -F assetData=@/path/to/photo.jpg \
  -F fileCreatedAt=2026-07-26T00:00:00.000Z \
  -F fileModifiedAt=2026-07-26T00:00:00.000Z
```

### 3.8 Get asset detail (incl. `exifInfo` / GPS)

- `GET /api/assets/{id}` — permission `asset.read`.
- Success: `200` `AssetResponseDto`: always includes `id`, `type` (`IMAGE`/`VIDEO`),
  `checksum` (base64 SHA1), `originalFileName`, `originalPath`, `ownerId`,
  `fileCreatedAt`, `fileModifiedAt`, `localDateTime`, `createdAt`, `updatedAt`,
  `duration`, `width`, `height`, `hasMetadata`, `isArchived`, `isEdited`, `isFavorite`,
  `isOffline`, `isTrashed`, `thumbhash`, `visibility`.
- `exifInfo` (object) is populated **asynchronously** by the `metadataExtraction` job —
  see section 4. Once present its keys are (verified live): `latitude`, `longitude`,
  `city`, `state`, `country` (the last three from reverse geocoding), `dateTimeOriginal`,
  `modifyDate`, `timeZone`, `make`, `model`, `lensModel`, `fNumber`, `focalLength`,
  `iso`, `exposureTime`, `orientation`, `projectionType`, `rating`, `description`,
  `exifImageWidth`, `exifImageHeight`, `fileSizeInByte`. Fields absent from the file are
  `null`.
- Unknown id / not owned by caller: **`400`** `{"message":"Not found or no asset.read
  access"}`.

```bash
curl -sf http://127.0.0.1:2283/api/assets/$ASSET_ID -H "x-api-key: $TENANT_KEY"
```

You can also *set* GPS after upload: `PUT /api/assets/{id}` with
`{"latitude":12.3,"longitude":45.6}` -> `200` with updated `exifInfo`; reverse geocoding
(city/state/country) re-runs asynchronously afterwards.

### 3.9 Metadata search (incl. GPS-derived city/state/country)

- `POST /api/search/metadata` — permission `asset.read`. `{}` is a valid body.
- Useful `MetadataSearchDto` fields (all optional): `city`, `state`, `country` (strings;
  nullable — sending explicit `null` matches assets *without* that field), `make`,
  `model`, `lensModel`, `originalFileName` (substring match), `checksum` (base64 or hex
  sha1), `id`, `takenAfter`/`takenBefore`, `createdAfter`/`createdBefore`,
  `updatedAfter`/`updatedBefore`, `type` (`IMAGE`|`VIDEO`), `visibility`, `isFavorite`,
  `isNotInAlbum`, `withDeleted`, `withExif` (bool — include `exifInfo` in results),
  `rating`, `description`, `ocr`, `order` (`asc`|`desc`, default `desc`), `page`
  (>= 1), `size` (1..1000).
- **No numeric lat/lng filter exists in v3.0.3.** Coordinate-level queries use
  `GET /api/map/markers` (permission `map.read`; query params `fileCreatedAfter`,
  `fileCreatedBefore`, `isArchived`, `isFavorite`, `withPartners`, `withSharedAlbums`)
  -> `200` array of `{id, lat, lon, city, state, country}` for the caller's geotagged
  assets. Exact-coordinate assertions should read `exifInfo` from 3.8.
- Success: `200` `{"albums": {...}, "assets": {"items": [AssetResponseDto...], "count":
  <this page>, "nextPage": <string|null>, "facets": [...], "total": ...}}`.
  **`assets.total` is deprecated since v3.0.0 — paginate with `count` + `nextPage`
  instead.**
- Results are scoped to the calling user's assets. City/country filters only match after
  reverse geocoding has run (part of metadata extraction, section 4).
- Adjacent: `GET /api/search/places?name=<q>` searches the geodata gazetteer (not user
  assets); `GET /api/search/cities` returns one asset per distinct city the caller has
  photos in — a handy "reverse geocoding landed" probe.

```bash
curl -sf -X POST http://127.0.0.1:2283/api/search/metadata \
  -H "x-api-key: $TENANT_KEY" -H 'Content-Type: application/json' \
  -d '{"city":"Faro","withExif":true,"size":100}'
```

### 3.10 Delete assets (bulk)

- `DELETE /api/assets` — permission `asset.delete`.
- Request JSON `AssetBulkDeleteDto`: required `ids` (array of uuid); optional `force`
  (bool). Default/false -> assets move to **trash** (restorable). `force:true` ->
  permanent delete.
- Success: `204` No Content. Hard delete is effectively immediate: verified live, a
  `GET /api/assets/{id}` within ~0.5 s already returns the `400` not-found and the bytes
  are queued for file deletion; search stops returning the asset immediately.
- Trash endpoints (per-user, i.e. per-tenant): `POST /api/trash/empty` -> `200`
  `{"count":n}`; `POST /api/trash/restore` -> `200 {"count":n}`;
  `POST /api/trash/restore/assets` with `{"ids":[...]}`.

```bash
curl -sf -X DELETE http://127.0.0.1:2283/api/assets \
  -H "x-api-key: $TENANT_KEY" -H 'Content-Type: application/json' \
  -d '{"ids":["'$ASSET_ID'"],"force":true}'
```

### 3.11 Jobs / queues (trigger + check metadata extraction)

Three distinct APIs — do not mix them up:

1. **Targeted re-run (preferred, works with the tenant's own key):**
   `POST /api/assets/jobs` — body `{"assetIds":["<uuid>", ...], "name":"<AssetJobName>"}`
   where `name` in `refresh-metadata` | `refresh-faces` | `regenerate-thumbnail` |
   `transcode-video`. Use `refresh-metadata` to (re)run EXIF/GPS extraction.
   Success `204`. Then poll 3.8 until `exifInfo` updates.
2. **Queue-wide trigger (admin, deprecated-but-functional):**
   `PUT /api/jobs/{name}` — path `name` from the queue enum (`metadataExtraction`,
   `thumbnailGeneration`, `sidecar`, `faceDetection`, `smartSearch`, `library`, `ocr`,
   ...); body `{"command":"start","force":false}` (commands: `start`|`pause`|`resume`|
   `empty`|`clear-failed`; `force:true` reprocesses ALL assets, not just pending — avoid
   on the shared stack). **Success `200` only when the queue is idle**; the `200` body is
   `{"queueStatus": {"isPaused": ..., "isActive": ...}, "jobCounts": {...}}`. If the
   queue already has active jobs the server returns **`400`**
   `{"message": "Job is already running"}` (verified live both ways on
   `metadataExtraction`). Orchestrator code must treat this `400` as benign (the queue is
   already working) or check queue idleness via 3.11.3 before calling. Deprecated since
   v2.4.0 but present in v3.0.3 and it is the only queue-wide "run" trigger.
   **Caution:** `POST /api/jobs` (body `{"name": ...}`) accepts only cleanup/manual job
   names (`user-cleanup`, `person-cleanup`, `tag-cleanup`, `memory-cleanup`,
   `backup-database`, ...) — it can NOT trigger metadataExtraction.
3. **Status polling (admin, modern):** `GET /api/queues/{name}` (permission
   `queue.read`) -> `200` `{"name", "isPaused", "statistics": {"active", "completed",
   "delayed", "failed", "paused", "waiting"}}`. Queue is idle when
   `statistics.active == 0 && statistics.waiting == 0`. `GET /api/queues` lists all.
   Legacy equivalent: `GET /api/jobs` (deprecated) returns per-queue `jobCounts`.

```bash
curl -sf -X POST http://127.0.0.1:2283/api/assets/jobs \
  -H "x-api-key: $TENANT_KEY" -H 'Content-Type: application/json' \
  -d '{"assetIds":["'$ASSET_ID'"],"name":"refresh-metadata"}'

curl -sf http://127.0.0.1:2283/api/queues/metadataExtraction -H "x-api-key: $IMMICH_API_KEY"
```

### 3.12 Server info + per-user storage/quota

- `GET /api/server/ping` — public -> `{"res":"pong"}` (the health check).
- `GET /api/server/version` — public -> `{major, minor, patch, prerelease}`.
- `GET /api/server/about` — authed (`server.about`) -> build/runtime details
  (`version`, `sourceCommit`, `build`, `nodejs`, `exiftool`, `ffmpeg`, `libvips`,
  `imagemagick`, `licensed`, ...).
- `GET /api/server/storage` — authed -> disk-level totals: `{diskAvailable, diskSize,
  diskUse (human strings), diskAvailableRaw, diskSizeRaw, diskUseRaw (bytes),
  diskUsagePercentage}`.
- **Per-tenant usage (admin):** `GET /api/server/statistics` (`server.statistics`) ->
  `{photos, videos, usage, usagePhotos, usageVideos, usageByUser: [{userId, userName,
  photos, videos, usage, usagePhotos, usageVideos, quotaSizeInBytes}]}` — this is the
  canonical "how much is each PAB site using" call.
- Also: `GET /api/admin/users/{id}/statistics` -> `{images, videos, total}` (asset
  counts; optional query `isFavorite`, `isTrashed`, `visibility`); `quotaUsageInBytes` /
  `quotaSizeInBytes` also appear on every `UserAdminResponseDto`.
- Quota is set at user create (3.3) or later via `PUT /api/admin/users/{id}` with
  `{"quotaSizeInBytes": <int|null>}` (null = unlimited).

```bash
curl -sf http://127.0.0.1:2283/api/server/statistics -H "x-api-key: $IMMICH_API_KEY"
```

## 4. Async EXIF caveat (important)

`POST /api/assets` returns `201` **before** any EXIF/GPS parsing happens. The upload
enqueues a `metadataExtraction` job (EXIF parse + reverse geocoding) and a thumbnail
job. Until the metadata job finishes, `GET /api/assets/{id}` returns the asset with
`exifInfo` missing/empty (`hasMetadata` false, `latitude` null), and
`/api/search/metadata` city/country filters will not match it.

**Measured on this stack (idle):** end-to-end upload call ~40 ms; `exifInfo.latitude`,
`longitude`, `city`, `state`, `country` all populated **~0.3 s after upload**. Under
load (bulk import, ML jobs running) expect seconds, not milliseconds.

**Recommended pattern for `immichClient.js`:**

```
uploadAsset(...) -> id
poll every 250-500 ms, timeout 30 s:
    a = GET /api/assets/{id}
    done when a.exifInfo && a.exifInfo.latitude !== null   // for GPS-bearing photos
    (for photos known to have no GPS, poll a.exifInfo.dateTimeOriginal
     or a.hasMetadata instead — latitude stays null forever for them)
on timeout: POST /api/assets/jobs {assetIds:[id], name:"refresh-metadata"} and
    poll once more before failing
```

Admin-side alternative: poll `GET /api/queues/metadataExtraction` until
`active == 0 && waiting == 0`, then read the asset once. (The Immich e2e suite's own
HTTP fallback uses exactly this queue-idle condition, polling every 200 ms.)
Websockets (`socket.io` path `/api/socket.io`, event `on_upload_success`) exist but are
not required; HTTP polling is fully supported.

Same caveat applies after `PUT /api/assets/{id} {latitude, longitude}`: the response
echoes the new coordinates immediately, but city/state/country from reverse geocoding
update asynchronously.

## 5. Tenancy & isolation notes

**What one-user-per-site buys you:**

- Assets, search results, map markers, trash, albums, and API keys are all scoped to the
  owning user. A tenant key cannot read another tenant's asset (returns the `400`
  not-found from 3.8) and cannot delete another user's API key.
- Upload duplicate detection (checksum) is per user (unique index on
  `(ownerId, checksum)`), so identical photos across sites remain separate assets.
- On-disk originals live under the Immich upload volume at
  `upload/<userId>/...` (storage-template engine is **disabled by default** on v3.0.3,
  so files keep hashed paths under the user's upload folder). Setting `storageLabel` at
  user create only matters if the storage template is ever enabled — the template then
  uses `storageLabel` instead of the raw userId as the per-user folder name
  (`library/<storageLabel>/...`). Recommendation: still set `storageLabel:
  "pab-site-<id>"` at create time so a future template migration yields readable
  per-tenant paths; do NOT enable the template yourself on the shared stack.
- Per-tenant caps: set `quotaSizeInBytes` at create; uploads beyond it fail `400`
  `"Quota has been exceeded!"`. Usage is tracked in `quotaUsageInBytes` and in
  `GET /api/server/statistics -> usageByUser`.

**Known pitfalls / leaks to avoid:**

- **The admin sees everything.** The admin key can enumerate all users
  (`/api/admin/users`), all usage (`/api/server/statistics`), and can reprocess or
  purge anything. Never ship the admin key to site-facing code; use it only inside the
  orchestrator for provisioning/purging/quotas/job control.
- **Partner sharing:** users can share their whole timeline with another user
  (`/api/partners`). Cross-tenant leakage is possible **only if** two tenant users
  partner with each other — nothing does this by default, and tenants have no way to
  discover each other unless code calls `GET /api/users` (which lists all users' basic
  info and is available to any authenticated user — a `user.read` side channel worth
  knowing about; it exposes names/emails, not assets).
- **Shared albums / shared links:** an album owner can add other users or create public
  share links (`?key=` / `?slug=` query auth). Don't build these into tenant flows and
  they won't exist.
- **External libraries** (`/api/libraries`, admin-only): import files from server-side
  paths, bypassing per-user upload folders and quota accounting (external assets do not
  count against quota). Don't create them for tenants.
- **Global ML/queues are shared.** Heavy jobs (`force:true` queue restarts, bulk
  imports) affect every tenant's latency. Prefer targeted `POST /api/assets/jobs`.
- **`hidden`/`locked` visibility** assets don't appear in normal timeline/search
  responses — remember this when reconciling counts (`visibility` filter in 3.9).

## 6. Purge recipe (fully remove a tenant)

Because hard-deleting the user cascades to everything they own (DB rows for assets,
EXIF, albums, API keys, sessions + their on-disk upload/thumbnail/encoded-video
folders), the minimal correct purge is short:

```bash
# 0) Resolve the tenant's userId if you only have the email
USER_ID=$(curl -sf "http://127.0.0.1:2283/api/admin/users" -H "x-api-key: $IMMICH_API_KEY" \
  | jq -r '.[] | select(.email=="site-123@pab.local") | .id')

# 1) (Optional but recommended) revoke the site credential first so the site
#    goes dark immediately even if step 2 lags:
curl -sf -X DELETE http://127.0.0.1:2283/api/api-keys/$KEY_ID -H "x-api-key: $TENANT_KEY"
#    (owner-only; skip if you no longer have the tenant key — step 2 removes it anyway)

# 2) Hard-delete the user (queues immediate background purge of files + DB cascade)
curl -sf -X DELETE http://127.0.0.1:2283/api/admin/users/$USER_ID \
  -H "x-api-key: $IMMICH_API_KEY" -H 'Content-Type: application/json' \
  -d '{"force":true}'          # -> 200, body has status "removing", deletedAt set

# 3) Verify (poll; the purge runs on the backgroundTask queue, usually seconds):
#    a) user gone from the default listing:
curl -sf "http://127.0.0.1:2283/api/admin/users" -H "x-api-key: $IMMICH_API_KEY" \
  | jq -e --arg id "$USER_ID" 'map(select(.id==$id)) | length == 0'
#    b) even with withDeleted the row eventually disappears:
curl -sf "http://127.0.0.1:2283/api/admin/users?withDeleted=true&id=$USER_ID" \
  -H "x-api-key: $IMMICH_API_KEY"
#    c) tenant gone from usage accounting:
curl -sf http://127.0.0.1:2283/api/server/statistics -H "x-api-key: $IMMICH_API_KEY" \
  | jq -e --arg id "$USER_ID" '.usageByUser | map(select(.userId==$id)) | length == 0'
#    d) the tenant key (if not deleted in step 1) now returns 401.
```

Notes:

- You do **not** need to delete assets first — `{"force":true}` user deletion removes
  them (explicit `DELETE /api/assets` + `POST /api/trash/empty` per 3.10 is only needed
  when emptying a tenant you intend to keep).
- Soft-delete path (body `{}`): user disabled immediately, purge deferred
  `user.deleteDelay` days (default 7), reversible via
  `POST /api/admin/users/{id}/restore`. Use it when PAB wants a grace period.
- The purge itself runs on the `backgroundTask` queue — if verification (3a-3c) hasn't
  converged, check `GET /api/queues/backgroundTask` for `active/waiting > 0` before
  declaring failure.
- Never call `POST /api/jobs {"name":"user-cleanup"}` casually: it sweeps **all**
  soft-deleted users past their delay, not just your tenant.

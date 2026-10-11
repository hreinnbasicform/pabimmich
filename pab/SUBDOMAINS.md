# Per-site subdomains + multi-backend membership

How `<sitename>.<domain>` (e.g. `testsite1.photoappbackend.com`) maps to a tenant,
and how one person can belong to several sites with different permissions.

## 1. Tenant resolution (app-level — DONE)

`requireTenant` (orchestrator/server.js) resolves the tenant in this order:

1. `X-Tenant` header (API clients / agents), else
2. the **subdomain host** via `tenantFromHost(req)` — the leftmost label of the
   Host, when the host ends in a configured base domain.

Config: `PAB_BASE_DOMAIN` (comma-separated; default `photoappbackend.com,localhost`).
Reserved leftmost labels `www`, `api`, `app`, `admin` and the bare apex resolve to
**no tenant** (so the apex serves the landing, and `api.` can host the raw API).

Examples (base `photoappbackend.com`):

| Host | Resolved sitename |
|------|-------------------|
| `testsite1.photoappbackend.com` | `testsite1` |
| `testsite1.dev.photoappbackend.com` | `testsite1` |
| `www.photoappbackend.com` / apex | none (landing) |
| `api.photoappbackend.com` + `X-Tenant: testsite1` | `testsite1` (header) |

`app.set('trust proxy', true)` is set so `req.hostname`/`req.protocol` reflect the
proxy's `X-Forwarded-Host` / `X-Forwarded-Proto`. The reverse proxy **must** forward
the original Host: `proxy_set_header Host $host;`.

## 2. Infra still required (Human — NOT done here)

App-level resolution is code; the following are ops/DNS/TLS decisions:

- **DNS**: a wildcard `*.photoappbackend.com` (and apex + `www`) → the prod host.
- **Wildcard TLS**: a `*.photoappbackend.com` certificate (DNS-01 via Let's Encrypt,
  or Cloudflare Advanced Certificate Manager — note Universal SSL doesn't cover
  multi-level `*.dev.…`). See `launch-beta-todolist.md` #3/#17.
- **Reverse proxy** (nginx/Caddy/Traefik): route by Host —
  - apex/`www` → the orchestrator landing (`GET /`),
  - `*.photoappbackend.com` → the **Immich web** (`:2283`) for the photo UI, and/or
    the orchestrator API (`:8100`) for `/photos`, `/folders`, … . Decide whether the
    photo UI and the API share the subdomain (path-split) or use `api.` for the API.
  - Always `proxy_set_header Host $host;` so tenant resolution sees the real host.
- The Immich web app is a single shared instance; per-site *data* isolation is by the
  Immich user + PAB's r/i/m/d layer, not by separate Immich deployments.

Example nginx sketch:

```nginx
server {
  server_name ~^(?<site>[^.]+)\.photoappbackend\.com$;
  location /api/pab/ { proxy_pass http://127.0.0.1:8100/; proxy_set_header Host $host; }
  location /        { proxy_pass http://127.0.0.1:2283;  proxy_set_header Host $host; }
}
server { server_name photoappbackend.com www.photoappbackend.com;
  location / { proxy_pass http://127.0.0.1:8100/; proxy_set_header Host $host; } }
```

## 3. Multi-backend membership (a user in several sites)

The data model **already** supports one person belonging to many sites with
different permissions — no schema change was needed:

- `users` is a **global** identity (keyed by email).
- `site_members` is per **(site_id, user_id)** — so the same user has an independent
  row, **passport**, and `role` in each site.
- `folder_permissions` are site-scoped (via `folder_id`), so grants never leak
  across sites.

Therefore one email can be `rimd` (owner/manager) on `testsite1`, `r` (viewer) on
`testsite2`, and a group member on `testsite3` — each with its **own passport**.
There is no cross-site single-sign-on: a member holds one passport per site and
sends it (with that site's `X-Tenant`/subdomain). To grant an existing person
access to another site, `POST /members` on that site with the same email — it
reuses the global `users` row and mints a new per-site passport.

Admin visibility: `GET /users/:email/sites` (master key) lists every site a user
belongs to, with `role` and `membership_status` (including legacy-owner sites).

### Not yet built (future, if cross-site UX is wanted)
- A single credential that lists/switches between a user's backends (SSO / a
  per-user account with linked site passports). Today each site is a separate
  passport by design.

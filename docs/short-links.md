# Short links (arbor.st)

Custom `arbor.st/{slug}` redirects are managed in the portal at
**Marketing → Short links** and served by a thin Cloudflare Worker that
looks up overrides in Convex.

## Redirect behavior

| Request | Result |
|---|---|
| `GET arbor.st/` | 302 → `https://arborlive.stanford.edu/` |
| `GET arbor.st/{slug}` with Convex override | 302 → stored destination (+ query string forwarded) |
| `GET arbor.st/{slug}` without override | 302 → `https://arborlive.stanford.edu/{slug}` |
| Non-GET | 403 |

Disabled or expired links behave like misses (pass-through).

## Convex

- Table: `shortLinks` (`packages/backend/convex/shortLinks.ts`)
- HTTP lookup: `GET {CONVEX_SITE_URL}/short-link?slug=...` with
  `Authorization: Bearer {SHORT_LINK_WORKER_SECRET}`
- Daily cron deletes rows past `expiresAt`

### Convex env vars

```bash
cd packages/backend
npx convex env set SHORT_LINK_WORKER_SECRET "$(openssl rand -hex 32)"
```

Optional: `SHORT_LINK_FALLBACK_BASE_URL=https://arborlive.stanford.edu`

## Cloudflare Worker

Source: [`workers/arbor-short-link/`](../workers/arbor-short-link/)

```bash
cd workers/arbor-short-link
# Set CONVEX_SITE_URL in wrangler.toml [vars] for your deployment
wrangler secret put SHORT_LINK_WORKER_SECRET   # same value as Convex
wrangler deploy
```

Worker env:

| Variable | Purpose |
|---|---|
| `CONVEX_SITE_URL` | Convex HTTP actions origin (`*.convex.site`) |
| `SHORT_LINK_WORKER_SECRET` | Must match Convex |
| `FALLBACK_BASE_URL` | Optional; default `https://arborlive.stanford.edu` |

## Migrating from Worker KV

1. Export KV keys/values to JSON (array of `{ slug, destinationUrl }` or
   wrangler `{ key, value }` rows).
2. Transform:

   ```bash
   node scripts/import-kv-short-links.mjs kv-export.json > import-payload.json
   ```

3. Import:

   ```bash
   cd packages/backend
   npx convex run internal.shortLinks.importFromKv -- "$(cat ../import-payload.json)"
   ```

4. Deploy the updated Worker (Convex lookup, no KV binding).
5. Smoke-test existing slugs and a pass-through path.

## Web env

Optional dashboard copy-link base:

```bash
NEXT_PUBLIC_SHORT_LINK_BASE_URL=https://arbor.st
```

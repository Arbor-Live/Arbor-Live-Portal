# Immich for event & band media

Event and band photo/video galleries are backed by a self-hosted [Immich](https://immich.app) server. Convex owns the integration server-side: it creates one Immich **album** per event/band, generates an **upload-enabled share link** for that album, and mirrors a lightweight index of the album's assets into Convex so the portal can list media without exposing the Immich API key to the browser.

The Immich API key never reaches the client. Browsers only ever touch Immich through the public **share link key**, and thumbnails/originals are fetched with that key appended as a query parameter.

## How it fits together

```
event / band  ──►  immichAlbumLinks (Convex)  ──►  Immich album + shared link
                        │                              │
                        ├─ immichAlbumId               ├─ /albums/{id}        (staff deep link)
                        ├─ sharedLinkKey  ─────────────┴─ /share/{key}        (public gallery)
                        └─ immichAssetRecords (mirrored asset index)
```

- **`immichAlbumLinks`** — one row per entity (`entityType` = event/band, `entityId`), holding the Immich `immichAlbumId`, the `sharedLinkId`/`sharedLinkKey`, and the derived `shareUrl`.
- **`immichAssetRecords`** — the mirrored per-asset index (`immichAssetId`, filename, IMAGE/VIDEO type) used to render galleries. Records are **per album**: an asset uploaded to an event is also added to each linked artist's album, so it has one source row per album it belongs to.

### Album + share-link flow

1. **Ensure the album.** The first time media is needed for an entity, an action
   (`immichEnsure.ensureEventAlbum` / `ensureBandAlbum` / `ensureUploadAlbum`)
   calls `createImmichAlbum` and then `createImmichAlbumSharedLink`
   (`type: "ALBUM"`, `allowUpload: true`, `allowDownload: true`). The album id,
   shared-link id, and key are persisted to `immichAlbumLinks`.
2. **Upload.** Uploads either go directly to Immich via the share link, or flow
   through Convex (   `immich.recordUploadedAsset` → `immichActions.addUploadedAssetToAlbum`,
   which calls `uploadImmichAsset` / `addAssetsToImmichAlbum`). Public
   booking-request / quote portal clients use the token-scoped equivalent
   (`publicMedia.recordMediaUploadByToken`) from the portal's **After the event**
   tab, so their uploads are registered and mirrored too.
   > **Note:** the public path is *registration*, not a byte proxy. The browser
   > still uploads to Immich directly with the album share key, so the
   > per-token rate limit in `recordMediaUploadByToken` is a best-effort
   > backstop — a token holder could POST to Immich without calling it. The
   > share key is a capability by design; hard upload quotas belong at the
   > Immich/ingress layer, not here.
3. **Sync the index.** `immichActions.syncAlbumAssets` lists the album's assets
   via `listImmichAlbumAssets` (a paged `POST /search/metadata` with
   `albumIds: [id]`) and reconciles `immichAssetRecords`. `immich.runBackfillAlbums` /
   `immichActions.backfillAllAlbums` rebuild the index across all linked albums.
   When the album is an event album, `addUploadedAssetToAlbum` also mirrors the
   asset into every artist album on the event lineup (ensuring each band album
   exists first), so an artist's album collects photos from all of their events.
   Media uploaded before the mirror existed is caught up by
   `internal.immich.runBackfillArtistAlbumMirror` (internal, deploy-key gated;
   resumable paged action — see below).
4. **Serve.** Public galleries call `buildSharedAssetUrl(assetId, kind, shareKey)`
   which produces `"{IMMICH_URL}/api/assets/{id}/{thumbnail|original|video/playback}?key={shareKey}"`.
   Staff can deep-link to the Immich UI with `buildImmichAlbumUrl` / `buildImmichShareUrl`.

All API access lives in [`packages/backend/convex/lib/immichClient.ts`](../packages/backend/convex/lib/immichClient.ts) and authenticates with the `x-api-key` header. `IMMICH_URL` is normalized (trailing slash stripped) and the REST base is `"{IMMICH_URL}/api"`.

> **Immich version:** the client targets the **Immich v3** API. Notable v3
> assumptions baked in: album membership is read via `POST /search/metadata`
> (the `assets` array was removed from `GET /albums/:id`), asset uploads no
> longer send `deviceId`/`deviceAssetId`, and library searches pin
> `visibility: "timeline"` (v3 changed the default to "any"). Run against an
> Immich v3+ server.

## 1. Provision an Immich API key

1. Sign in to your Immich server as the account that should own the albums.
2. **Account Settings → API Keys → New API Key**; grant it album and asset
   permissions (album create/read, asset upload/read, shared-link create).
3. Copy the key — you will set it as `IMMICH_API_KEY`.

The albums and share links this app creates are owned by that account, so use a
service/admin account you are comfortable having own portal media.

## 2. Convex environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `IMMICH_URL` | Yes (media) | Public base URL of the Immich server, e.g. `https://photos.example.com` (no trailing slash; the app appends `/api`) |
| `IMMICH_API_KEY` | Yes (media) | Immich API key — **server-side only**, never exposed to the browser |

Set them per deployment from `packages/backend`:

```bash
npx convex env set IMMICH_URL "https://photos.example.com"
npx convex env set IMMICH_API_KEY "<immich-api-key>"
```

`isImmichConfigured()` gates the feature: if either var is unset, media
features no-op instead of throwing on every request.

### Web app variable (`next/image`)

Immich thumbnails/originals are rendered through `next/image`, so the Immich
hostname must be an allowed remote image host. Set this on the **web app**
(Vercel/local `.env`), not Convex:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_IMMICH_URL` | Recommended | Same public Immich URL; its hostname is added to `next.config.ts` `images.remotePatterns` |

Without it, `next/image` will refuse to optimize Immich-hosted images. See
[`apps/web/next.config.ts`](../apps/web/next.config.ts).

## 3. Component wiring in this repo

- Immich REST client — [`packages/backend/convex/lib/immichClient.ts`](../packages/backend/convex/lib/immichClient.ts)
- Album/share-link ensure actions — [`packages/backend/convex/immichEnsure.ts`](../packages/backend/convex/immichEnsure.ts)
- Album + asset sync actions — [`packages/backend/convex/immichActions.ts`](../packages/backend/convex/immichActions.ts)
- Public/staff media queries & upload mutations — [`packages/backend/convex/immich.ts`](../packages/backend/convex/immich.ts)
- Schema (`immichAlbumLinks`, `immichAssetRecords`) — [`packages/backend/convex/schema.ts`](../packages/backend/convex/schema.ts)
- `next/image` allow-listing — [`apps/web/next.config.ts`](../apps/web/next.config.ts)

Marketing/public-work galleries reuse the same client through
`marketingImmich.ts` / `marketingImmichActions.ts`.

### Artist-album mirror backfill

Event media uploaded before the mirror shipped is copied into artist albums by
`internal.immich.runBackfillArtistAlbumMirror`. It is an **internal** function:
runnable from `convex run` and the Convex dashboard with no user identity, gated
by the deploy key (the same authority that can deploy). It runs one bounded page
inline and is resumable. Each invocation mirrors at most `MAX_ASSETS_PER_RUN`
assets across up to `MAX_EVENTS_PER_RUN` events (newest first), draining each
event's album page by page. It reads from the Convex asset index (no Immich list
call) and calls `PUT /albums/:id/assets` per asset.

It returns
`{ eventsScanned, assetsMirrored, nextCursor, assetCursor, assetCursorEventId, isDone }`.
`nextCursor` (event-table) and `assetCursor`/`assetCursorEventId` (mid-event)
are opaque Convex cursors — pass them back unchanged. When a run stops mid-event,
`assetCursorEventId` identifies which event `assetCursor` belongs to.

```bash
cd packages/backend
# start the walk (no identity needed — internal function, deploy-key gated):
npx convex run internal.immich.runBackfillArtistAlbumMirror '{}'
# continue from where it stopped, using the returned cursors verbatim:
npx convex run internal.immich.runBackfillArtistAlbumMirror \
  '{"cursor":"<nextCursor>","assetCursor":"<assetCursor>","assetCursorEventId":"<assetCursorEventId>"}'
```

Add `--prod` to target production (`... --prod`). From the **Convex dashboard**,
run the same function via *Functions → internal.immich:runBackfillArtistAlbumMirror*
(no identity required). To fan the whole walk out in one go, call
`internal.immich.startBackfillArtistAlbumMirror` once — it schedules the paged
action fire-and-forget.

Re-running is idempotent per artist album: `recordAssetInternal` skips rows that
already exist, so a second pass only re-issues the harmless Immich add.

## Verification

1. Set `IMMICH_URL` + `IMMICH_API_KEY` on the deployment and `NEXT_PUBLIC_IMMICH_URL` on the web app.
2. Open an event, trigger media (ensure album), and confirm a row appears in
   `immichAlbumLinks` with a non-empty `sharedLinkKey` and `shareUrl`.
3. In Immich, confirm the album and an **upload-enabled shared link** now exist.
4. Upload a photo, then run the album sync and confirm `immichAssetRecords`
   gains a row for it.
5. Open the portal gallery (unauthenticated where applicable) and confirm
   thumbnails load from `{IMMICH_URL}/api/assets/{id}/thumbnail?key=...` — no API
   key in the request.

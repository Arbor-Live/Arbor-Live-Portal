# Cloudflare R2 for inventory uploads

Inventory package hero images, type icons/promo images, manuals, and GDTF files upload to Cloudflare R2 via the official [`@convex-dev/r2`](https://www.convex.dev/components/cloudflare-r2) Convex component.

Uploaded assets are stored in Convex as `r2:<object-key>` references. When `R2_PUBLIC_BASE_URL` is set, public pages serve files from your **custom domain**. Otherwise reads fall back to short-lived signed S3 API URLs.

## 1. Create an R2 bucket

1. In Cloudflare Dashboard → R2 → Create bucket.
2. Create an API token with **Object Read & Write** for that bucket.
3. Save the access key ID, secret access key, and S3 API endpoint URL.

## 2. Custom domain (recommended for public serving)

Uploads always use the **S3 API endpoint** (`https://<account-id>.r2.cloudflarestorage.com`). Custom domains are **read-only** and used to serve files in the browser.

1. R2 bucket → **Settings** → **Custom domains** → connect your domain (e.g. `assets.example.com`).
2. Ensure the bucket allows public reads via that domain (Cloudflare documents public access / custom domain setup for the bucket).
3. Set `R2_PUBLIC_BASE_URL=https://assets.example.com` (no trailing slash) on your Convex deployment.

Public URL shape:

```
https://assets.example.com/inventory/packages/{id}/hero/{uploadId}-photo.jpg
```

The path after the domain matches the R2 object key stored in Convex (without the `r2:` prefix).

If `R2_PUBLIC_BASE_URL` is unset, the app uses signed URLs from the S3 API host instead (expire after 24 hours in public queries).

## 3. CORS policy

Browser uploads go **directly to R2** using presigned PUT URLs from Convex. CORS must allow your **web app origins**, not Convex:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-production-domain"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"]
  }
]
```

`GET` is included so the admin UI can preview uploads before save. Public pages using the custom domain load images from that domain instead.

## 4. Convex environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `R2_ACCESS_KEY_ID` | Yes | R2 API access key |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 API secret |
| `R2_ENDPOINT` | Yes | S3 API endpoint: `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | Yes | Bucket name |
| `R2_PUBLIC_BASE_URL` | Recommended | Custom domain for public reads, e.g. `https://assets.example.com` |

From `packages/backend`:

```bash
npx convex env set R2_ACCESS_KEY_ID "<access-key-id>"
npx convex env set R2_SECRET_ACCESS_KEY "<secret-access-key>"
npx convex env set R2_ENDPOINT "https://<account-id>.r2.cloudflarestorage.com"
npx convex env set R2_BUCKET "<bucket-name>"
npx convex env set R2_PUBLIC_BASE_URL "https://assets.example.com"
```

See [`packages/backend/.env.example`](../packages/backend/.env.example) for local reference.

## 5. Component wiring in this repo

- Component registered in [`packages/backend/convex/convex.config.ts`](../packages/backend/convex/convex.config.ts)
- URL resolution in [`packages/backend/convex/inventoryR2.ts`](../packages/backend/convex/inventoryR2.ts)
- Admin upload UI in [`apps/web/src/components/files/file-upload-field.tsx`](../apps/web/src/components/files/file-upload-field.tsx)

## Object key layout

```
inventory/packages/{packageId|draft/{uuid}}/hero/{uploadId}-{filename}
inventory/types/{typeId|draft/{uuid}}/icon|promo|manuals|gdtf/{uploadId}-{filename}
```

Stored in Convex as:

```
r2:inventory/packages/...
```

External HTTPS URLs can still be pasted manually for resource links hosted elsewhere.

## Limits

| Asset | Max size | Allowed types |
|-------|----------|----------------|
| Hero, icon, promo | 5 MB | JPEG, PNG, WebP, GIF, SVG |
| Manuals | 25 MB | PDF, ZIP, Markdown, plain text |
| GDTF | 25 MB | `.gdtf`, `.zip` |

## Verification

1. Set all env vars including `R2_PUBLIC_BASE_URL`.
2. Upload a package hero image in **Dashboard → Inventory → Packages** and save.
3. Confirm the saved value looks like `r2:inventory/packages/...`.
4. Open `/public/packages` — image `src` should be on your custom domain, not `r2.cloudflarestorage.com`.
5. Open the image URL directly in a browser (no auth) to confirm public read access works.

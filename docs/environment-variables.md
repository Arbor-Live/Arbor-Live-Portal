# Environment Variables

Single reference for every variable the code reads via `process.env`.

Where variables live:

- **Local files** — symlinked from `.git/arbor-env/` by `pnpm setup:worktree-env`
  (see the root [README](../README.md)). `packages/backend/.env.local` is
  written automatically by `convex dev`.
- **Convex dashboard** — per-deployment env vars; this is where backend
  runtime values must be set for dev *and* prod deployments (a local `.env`
  only affects the CLI, not deployed functions).
- **Vercel** — build-time values for the web app.

## Backend (read by Convex functions)

| Variable | Required | Purpose / read by |
|---|---|---|
| `BETTER_AUTH_SECRET` | yes | Better Auth signing secret (`convex/betterAuth/`) |
| `SITE_URL` | yes | Canonical app origin; trusted-origin checks (`lib/trustedOrigins.ts`) and links in emails |
| `ARBOR_ENV` | prod only | Set to `production` **only** on the prod Convex deployment; gates production behavior (`lib/trustedOrigins.ts`) |
| `BOOTSTRAP_ADMIN_SECRET` | yes (setup) | Gates `bootstrap.bootstrapAdmin`; must be high-entropy |
| `RESEND_API_KEY` | yes | Outbound email via Resend (`email/send.ts`, `http/resendInbound.ts`) — see [resend-email.md](resend-email.md) |
| `RESEND_INBOUND_WEBHOOK_SECRET` | yes (band payments) | Svix secret for the inbound-email webhook (`http/resendInbound.ts`) — see [resend-email.md](resend-email.md) |
| `EMAIL_FROM` | yes | Default From address (`email/constants.ts`) |
| `EMAIL_TEST_MODE` | no | `"true"` routes email sending into test mode (`email/send.ts`) |
| `ORGANIZER_EMAIL` | no | Organizer contact in emails; defaults to `EMAIL_FROM`'s address (`email/constants.ts`) |
| `PAYMENTS_EMAIL_FROM` | no | From address for band-payment emails; has a default (`email/constants.ts`) |
| `BAND_PAYMENTS_CC_EMAIL` | no | CC address on band-payment emails; has a default (`email/constants.ts`) |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET` | yes (uploads) | Cloudflare R2 via `@convex-dev/r2` (`inventoryR2.ts`) — see [r2-storage.md](r2-storage.md) |
| `R2_PUBLIC_BASE_URL` | yes (uploads) | Public read domain for stored assets, no trailing slash (`inventoryR2.ts`) |
| `IMMICH_URL`, `IMMICH_API_KEY` | yes (media) | Self-hosted Immich API (`lib/immichClient.ts`) — see [immich.md](immich.md) |
| `POSTPEER_ACCESS_KEY` or `POSTPEER_SECRET` | yes (IG publish) | PostPeer API key (`marketingInstagramActions.ts`) — header `x-access-key` |
| `POSTPEER_INSTAGRAM_ACCOUNT_ID` | yes (IG publish) | PostPeer Instagram account id for `platforms[].accountId` |
| `REVALIDATE_SECRET` | yes (public site) | Bearer token for Next.js `/api/revalidate` (`lib/siteRevalidation.ts`) |
| `CONVEX_CLOUD_URL`, `CONVEX_SITE_URL` | auto | Provided by Convex; also read as fallbacks by the web build script |

## Web (read by Next.js)

| Variable | Required | Purpose / read by |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | yes | Convex client URL (`lib/convex-env.ts`); in prod it is materialized at build time from `CONVEX_URL` (see [deployment.md](deployment.md)) |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | yes | Convex HTTP-actions origin (auth routes) |
| `NEXT_PUBLIC_SITE_URL` | no | Public origin used for absolute links; defaults to localhost in dev |
| `NEXT_PUBLIC_IMMICH_URL` | no | Allows Immich-hosted images through `next/image` (`next.config.ts`) |
| `CONVEX_URL` | build | Exported by `convex deploy --cmd`; consumed by `scripts/materialize-convex-public-env.mjs` and `next.config.ts` |

## Vercel project

| Variable | Purpose |
|---|---|
| `CONVEX_DEPLOY_KEY` | Lets the Vercel build run `convex deploy` against the right deployment |

## Keeping this file honest

When adding a new `process.env.*` read, add the variable here and to the
relevant `.env.example` (`apps/web/.env.example` or
`packages/backend/.env.example`). To find drift:

```bash
rg -o "process\.env\.[A-Z_0-9]+" apps/web packages -g '!node_modules' -g '!_generated' --no-filename | sort -u
```

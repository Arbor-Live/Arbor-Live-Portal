# Deployment

Production runs as: Vercel hosts the Next.js app; Convex hosts the backend.
A single Vercel build deploys *both*.

## How the build works

`apps/web/vercel.json`:

```json
{
  "installCommand": "pnpm install --dir ../..",
  "buildCommand": "cd ../../packages/backend && pnpm convex deploy --cmd 'pnpm run build'"
}
```

Sequence on every Vercel deploy:

1. `pnpm install` at the repo root (workspace install).
2. `convex deploy` pushes `packages/backend/convex/` to the Convex deployment
   selected by `CONVEX_DEPLOY_KEY` (set in Vercel project env).
3. `--cmd 'pnpm run build'` makes Convex run the backend package's `build`
   script *with `CONVEX_URL` exported*. That script is
   `pnpm --dir ../../apps/web run build`, i.e. the web build.
4. The web build first runs `apps/web/scripts/materialize-convex-public-env.mjs`,
   which resolves the Convex URL (`NEXT_PUBLIC_CONVEX_URL` → `CONVEX_URL` →
   `CONVEX_CLOUD_URL`), derives the `.convex.site` URL, and writes both into
   `apps/web/.env.production.local` so Next.js can inline the
   `NEXT_PUBLIC_*` values.
5. `next build` runs.

If the build fails with "Convex URL missing at build time", either the deploy
was not run through `convex deploy --cmd`, or `NEXT_PUBLIC_CONVEX_URL` is not
set in Vercel for that environment.

## Environment variables per surface

- **Vercel project**: `CONVEX_DEPLOY_KEY` (required), optionally
  `NEXT_PUBLIC_SITE_URL`.
- **Convex production deployment** (dashboard → Settings → Environment
  Variables): everything the backend reads — `BETTER_AUTH_SECRET`, `SITE_URL`,
  `ARBOR_ENV=production`, `RESEND_API_KEY`, `RESEND_INBOUND_WEBHOOK_SECRET`,
  `EMAIL_FROM`, `BOOTSTRAP_ADMIN_SECRET`, R2 vars, Immich vars. Full list in
  [environment-variables.md](environment-variables.md).

`ARBOR_ENV=production` must be set **only** on the production Convex
deployment; it gates production-only behavior (e.g. real email sending paths).

## Manual deploys / rollback

- Backend only: `cd packages/backend && npx convex deploy` (uses
  `CONVEX_DEPLOY_KEY` or interactive login).
- Frontend rollback: use Vercel's instant rollback. Note this does *not* roll
  back Convex functions or schema — if the bad deploy included backend
  changes, redeploy the previous commit instead so both sides stay in sync.
- Convex schema changes are additive-safe by default; for breaking changes
  follow the widen–migrate–narrow process (see the `convex-migration-helper`
  skill and `convex/migrations/`).

## Deploy failure triage

1. Read the Vercel build log — Convex deploy errors (schema validation,
   analysis errors) appear before the Next.js build starts.
2. "Convex URL missing at build time" → see above.
3. Type errors only on Vercel → run `pnpm --filter web build` locally; the
   local `pnpm typecheck` uses the same `tsc --noEmit` but `next build` also
   checks route typing.
4. Auth broken after deploy → verify `SITE_URL` on the Convex deployment
   matches the deployed origin (trusted-origins logic lives in
   `convex/lib/trustedOrigins.ts`).

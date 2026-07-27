# Deployment

Production runs as: Vercel hosts the Next.js app; Convex hosts the backend.
A single Vercel build deploys *both*.

## How the build works

`apps/web/vercel.json`:

```json
{
  "installCommand": "pnpm install --dir ../..",
  "buildCommand": "cd ../../packages/backend && pnpm convex deploy --cmd 'pnpm run build' && pnpm convex run migrations:runAll"
}
```

Sequence on every Vercel deploy:

1. `pnpm install` at the repo root (workspace install).
2. `convex deploy` pushes `packages/backend/convex/` to the Convex deployment
   selected by `CONVEX_DEPLOY_KEY` (set in Vercel project env).
3. `--cmd 'pnpm run build'` runs with `CONVEX_URL` exported by Convex:
   backend `build` → web `next build` (after materializing public Convex URLs).
4. `convex run migrations:runAll` kicks unfinished data migrations (completed
   jobs are skipped). Same pattern as the official `@convex-dev/migrations` docs.

If the build fails with "Convex URL missing at build time", either the deploy
was not run through `convex deploy --cmd`, or `NEXT_PUBLIC_CONVEX_URL` is not
set in Vercel for that environment.

### Deploy key permissions

Vercel’s `CONVEX_DEPLOY_KEY` must allow both deploy and running internal
mutations. When creating the key in the Convex dashboard (Deploy keys →
Generate), enable at least:

- `deployment:deploy`
- `deployment:functions:runInternalMutations`

Permissions are fixed at key creation. Editing checkboxes on an old key does
not update the value already stored in Vercel — mint a **new** key with both
actions, paste it into Vercel, and delete the old one.

If `convex run migrations:runAll` fails with `Unauthorized` /
missing `deployment:functions:runInternalMutations`, the key is under-scoped.

## Data migrations

- Use the official `@convex-dev/migrations` component (`convex/migrations.ts`).
- Append new jobs to `MIGRATION_SERIES` / `runAll` (never reorder completed ones).
- **Post-deploy:** Vercel runs `pnpm convex run migrations:runAll` after deploy
  (requires the key permissions above).
- Local / manual: `pnpm --filter backend migrate`
- Prod manual (logged in): `pnpm --filter backend migrate:prod`
- Status: `npx convex run --component migrations lib:getStatus --watch`
- Dry run one job: `npx convex run migrations:backfillHostOrgNormalizedNames '{"dryRun":true}'`

## Environment variables per surface

- **Vercel project**: `CONVEX_DEPLOY_KEY` (required; see permissions above),
  optionally `NEXT_PUBLIC_SITE_URL`.
- **Convex production deployment** (dashboard → Settings → Environment
  Variables): everything the backend reads — `BETTER_AUTH_SECRET`, `SITE_URL`,
  `ARBOR_ENV=production`, `RESEND_API_KEY`, `EMAIL_FROM`, R2 vars, Immich vars.
  Full list in [environment-variables.md](environment-variables.md).

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
  skill and `convex/migrations.ts` / `@convex-dev/migrations`).

## Deploy failure triage

1. Read the Vercel build log — Convex deploy errors (schema validation,
   analysis errors) appear before the Next.js build starts.
2. "Convex URL missing at build time" → see above.
3. Migrations `Unauthorized` after a successful code push → regenerate
   `CONVEX_DEPLOY_KEY` with `runInternalMutations` (see above).
4. Type errors only on Vercel → run `pnpm --filter web build` locally; the
   local `pnpm typecheck` uses the same `tsc --noEmit` but `next build` also
   checks route typing.
5. Auth broken after deploy → verify `SITE_URL` on the Convex deployment
   matches the deployed origin (trusted-origins logic lives in
   `convex/lib/trustedOrigins.ts`).

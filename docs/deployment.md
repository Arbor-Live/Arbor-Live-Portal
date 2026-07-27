# Deployment

Production runs as: Vercel hosts the Next.js app; Convex hosts the backend.
A single Vercel build deploys *both*.

## How the build works

`apps/web/vercel.json` runs `packages/backend/scripts/vercel-deploy.sh`:

- **Production** (`VERCEL_ENV=production`):  
  `convex deploy --cmd 'pnpm run build' && convex run migrations:runAll`
- **Preview**:  
  `convex deploy --cmd 'pnpm run build' --preview-run migrations:runAll`

Preview and production use **different** `CONVEX_DEPLOY_KEY` values in Vercel
(same name, different environment scopes). A preview key can create/update the
branch backend via `convex deploy`, but a separate `convex run` afterward
cannot reliably target that deployment — hence `--preview-run` for previews
only (`--preview-run` is ignored on production deploys).

Sequence:

1. `pnpm install` at the repo root (workspace install).
2. `convex deploy` pushes `packages/backend/convex/` using `CONVEX_DEPLOY_KEY`.
3. `--cmd 'pnpm run build'` runs with `CONVEX_URL` exported by Convex → web
   `next build` (after materializing public Convex URLs).
4. Migrations: `convex run` (prod) or `--preview-run` (preview). Completed jobs
   are skipped.

If the build fails with "Convex URL missing at build time", either the deploy
was not run through `convex deploy --cmd`, or `NEXT_PUBLIC_CONVEX_URL` is not
set in Vercel for that environment.

### Deploy keys (production vs preview)

In Vercel, configure **two** `CONVEX_DEPLOY_KEY` entries:

| Vercel environment | Key source | Prefix / kind |
|---|---|---|
| Production | Deployment settings → Generate production deploy key | `prod:…` / deployment token |
| Preview | Project settings → Generate preview deploy key | `preview:team:project\|…` |

Do not paste a preview key into Production (or vice versa).

For the **production** key, enable at least:

- `deployment:deploy`
- `deployment:functions:runInternalMutations`

Permissions are fixed at key creation — mint a new key if you need different
actions, paste into Vercel, delete the old one.

### Preview note on `--preview-run`

Convex may **reuse** an existing preview deployment for a branch. In that case
`--preview-run` only runs when the preview is first created. That is fine for
empty/new previews; if you need to re-run migrations on an existing preview,
run them from the dashboard/CLI against that preview deployment, or recreate
the preview.

## Data migrations

- Use the official `@convex-dev/migrations` component (`convex/migrations.ts`).
- Append new jobs to `MIGRATION_SERIES` / `runAll` (never reorder completed ones).
- **Post-deploy:** see build script above.
- Local / manual: `pnpm --filter backend migrate`
- Prod manual (logged in): `pnpm --filter backend migrate:prod`
- Status: `npx convex run --component migrations lib:getStatus --watch`
- Dry run one job: `npx convex run migrations:backfillHostOrgNormalizedNames '{"dryRun":true}'`

## Environment variables per surface

- **Vercel project**: `CONVEX_DEPLOY_KEY` (Production + Preview, different
  values), optionally `NEXT_PUBLIC_SITE_URL`.
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
3. Preview build fails on `convex run` / `Unauthorized` → ensure the build uses
   `vercel-deploy.sh` (`--preview-run`, not a follow-up `convex run`) and that
   Vercel Preview env has the **preview** deploy key.
4. Production migrations `Unauthorized` → regenerate the **production**
   `CONVEX_DEPLOY_KEY` with `runInternalMutations`.
5. Type errors only on Vercel → run `pnpm --filter web build` locally; the
   local `pnpm typecheck` uses the same `tsc --noEmit` but `next build` also
   checks route typing.
6. Auth broken after deploy → verify `SITE_URL` on the Convex deployment
   matches the deployed origin (trusted-origins logic lives in
   `convex/lib/trustedOrigins.ts`).

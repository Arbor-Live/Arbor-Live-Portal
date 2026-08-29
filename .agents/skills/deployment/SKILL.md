---
name: deployment
description:
  Deploying the portal: Vercel + Convex build pipeline, deploy keys,
  migrations, and rollback. Use when a deploy fails, migrations need running,
  or env vars must change in production.
---

# Deployment

Full runbook: `docs/deployment.md`. This skill is the fast path + tripwires.

## How a deploy works

One Vercel build deploys both sides via `packages/backend/scripts/vercel-deploy.sh`:

- Production: `convex deploy --cmd 'pnpm run build' && convex run migrations:runAll`
- Preview: same but `--preview-run migrations:runAll` (a follow-up
  `convex run` cannot target preview deployments reliably).

## Tripwires

- **Two `CONVEX_DEPLOY_KEY` values** in Vercel: Production and Preview
  environments, minted separately. Never paste one into the other. Prod key
  needs `deployment:deploy` + `deployment:functions:runInternalMutations`.
- **`ARBOR_ENV=production` lives only on the production Convex deployment**
  (dashboard → Settings → Environment Variables). It gates real email sending.
- Backend env vars are set on the Convex deployment, not in Vercel; only
  `CONVEX_DEPLOY_KEY` (+ optional `NEXT_PUBLIC_SITE_URL`) live in Vercel.
- Convex errors appear in the Vercel log **before** the Next build starts —
  read from the top.

## Migrations

- Append jobs to `MIGRATION_SERIES` / `runAll` in `convex/migrations.ts`;
  never reorder completed ones. Breaking schema changes: widen–migrate–narrow
  (see the `convex-migration-helper` skill).
- Local: `pnpm --filter backend migrate`. Prod manual: `pnpm --filter backend
  migrate:prod`. Status: `npx convex run --component migrations lib:getStatus
  --watch`.
- Preview note: Convex may reuse an existing preview deployment, so
  `--preview-run` only fires on first creation. Re-run migrations against the
  preview manually if needed.

## Rollback

- Frontend-only regressions: Vercel instant rollback.
- If the bad deploy touched **backend** code/schema: Vercel rollback is NOT
  enough — redeploy the previous commit so web and Convex stay in sync.

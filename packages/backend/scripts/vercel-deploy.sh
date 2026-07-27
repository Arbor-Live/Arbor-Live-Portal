#!/usr/bin/env sh
# Vercel build entry for packages/backend.
# Preview and production use different CONVEX_DEPLOY_KEY types; a follow-up
# `convex run` with a preview key cannot target the branch deployment, so
# preview migrations go through `--preview-run` instead.
set -eu

if [ "${VERCEL_ENV:-}" = "production" ]; then
  pnpm convex deploy --cmd 'pnpm run build'
  pnpm convex run migrations:runAll
else
  # --preview-run is ignored for production keys; for preview keys it runs
  # after push (on newly created previews; no-ops if already complete).
  pnpm convex deploy --cmd 'pnpm run build' --preview-run migrations:runAll
fi

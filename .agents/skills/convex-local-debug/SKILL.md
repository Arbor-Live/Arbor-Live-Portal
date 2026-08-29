---
name: convex-local-debug
description:
  Debugging the local Convex backend: inspecting data, deployment env vars,
  codegen, and resetting the anonymous dev deployment. Use when queries return
  unexpected data, auth is broken locally, or generated types are stale.
---

# Convex Local Debugging

## Two rules that explain most confusion

1. **Deployment env vars ≠ `.env` files.** Convex functions read env vars set
   on the deployment (`npx convex env set KEY value`), not
   `packages/backend/.env*`. Local dev needs at least `BETTER_AUTH_SECRET`,
   `SITE_URL`, and `EMAIL_TEST_MODE=true` (dry-run email) set on the
   deployment.
2. **Anonymous mode is the default local backend.**
   `CONVEX_AGENT_MODE=anonymous npx convex dev` in `packages/backend`
   provisions `127.0.0.1:3210` with fresh, ephemeral data.

## Inspecting data

- `npx convex data <table>` — dump rows from the CLI (add `--watch` to live-
  follow). Works against whatever deployment `.env.local` points at.
- Dashboard: `npx convex dashboard` for a GUI over the same deployment.
- Call a function directly: `npx convex run <path>:<fn> '{"arg": ...}'`
  (internal functions included).

## Common failures

| Symptom | Fix |
|---|---|
| `getUserIdentity()` always null / sign-in loops | `BETTER_AUTH_SECRET` / `SITE_URL` missing on the deployment env vars |
| Type errors referencing `_generated` | `pnpm --filter backend codegen` (or let `convex dev` push) |
| Web build: "Convex URL missing at build time" | Start `convex dev` first; then check `NEXT_PUBLIC_CONVEX_URL` |
| Placeholder `your-convex-deployment.convex.*` URLs | `packages/backend/.env` seeded from `.env.example` shadows real URLs — comment those lines out |
| Emails never send locally | Expected if `EMAIL_TEST_MODE=true` (dry-run). Set Resend vars to send for real |
| Sign-in points at a nonexistent `.convex.site` | Stale `CONVEX_SITE_URL` — re-run `convex dev` so `.env.local` regenerates |

## Reset

- Anonymous deployment data is ephemeral. To nuke local state: stop
  `convex dev`, delete `packages/backend/.convex/`, re-run `convex dev`
  (fresh DB; re-run any bootstrap, e.g. `/setup` for first admin).
- Fresh clone smell: run `pnpm install`, then `pnpm setup:worktree-env`.

## Pushing schema/API changes

Keep `convex dev` running — it watches and pushes automatically. Otherwise
`pnpm --filter backend codegen` after editing `packages/backend/convex/`.
Read `convex/_generated/ai/guidelines.md` before writing Convex code.

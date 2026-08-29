---
name: e2e-testing
description:
  Writing and running Playwright E2E tests in apps/web/e2e. Use when adding,
  changing, or debugging E2E tests, auth storage states, or CI test failures.
---

# E2E Testing (Playwright)

Full coverage map lives in `docs/e2e-coverage.md`. Read it before adding tests
so the new test lands in the right file.

## Running

- `pnpm test:e2e` — boots **anonymous** local Convex + Next, then runs
  Playwright. Stashes/restores any cloud `.env.local` automatically. In a
  **local**-mode worktree (`pnpm worktree-convex status`) it reuses that
  worktree's own Convex ports instead of the default `:3210`.
- `pnpm test:e2e:skip-boot` — reuse an already-running stack.
- `E2E_USE_CLOUD_DEV=1` — intentionally target shared cloud Dev (rarely what
  you want; burns team-plan DB I/O).
- `pnpm test:e2e:codegen <url>` — record a flow.
- CI (`.github/workflows/e2e.yml`): 4 shards, `E2E_WEB_MODE=prod`,
  `E2E_EMAIL_MOCK` (Resend never called), retries=2, blob reports merged.

## Config facts that matter (apps/web/playwright.config.ts)

- `workers: 1`, `fullyParallel: false` — tests share one seeded backend;
  ordering and isolation come from the setup projects.
- Three storage states via setup projects: `setup` → admin, `setup-crew` →
  crew, `setup-band` → band, written to `e2e/.auth/*.json`. Tests use
  `test.use({ storageState })` to pick a role.
- `actionTimeout: 45_000` deliberately — a bad locator must fail fast and
  loudly, not hang for the full 90s test timeout.

## Writing tests

- Prefer role/text locators over CSS. FormLabel here is not htmlFor-wired, so
  use `getByRole` over `getByLabel`.
- First page hit may catch Turbopack compiling: wait for stable UI text, not
  `networkidle` alone. See `e2e/helpers/auth.ts` `signInWithCredentials`.
- Never use `window.confirm`/`alert` in app code under test — the app uses
  `useAppDialog()`; Playwright helpers for that dialog live in
  `e2e/helpers/auth.ts`.
- Dev preview wizards (`?devPreview=1`) are NODE_ENV=development-only; do not
  build tests on them (CI runs the prod build).
- Seeds/fixtures: `e2e/helpers/bulk-seed.ts`, `e2e/helpers/convex.ts` for
  direct backend calls; `e2e/helpers/email.ts` reads the email mock.

## Debugging

- Failures retain screenshot + video + trace (on-first-retry). HTML report:
  `e2e-report/`.
- Backend not behaving? Check the anonymous Convex is up (the boot script
  prints URLs); wipe it by killing the boot and re-running `pnpm test:e2e`.

# Getting Started

How to go from a fresh clone to a working local app with an admin account.

## Prerequisites

- Node.js 20+ and pnpm 10 (the repo pins `pnpm@10.33.0` via `packageManager`)
- A [Convex](https://convex.dev) account (the Convex CLI signs you in on first run)

## 1. Install dependencies

```bash
pnpm install
```

`pnpm install` also runs the `prepare` script, which configures git hooks and
tries to link env files (it swallows errors on a fresh clone — that's expected
until step 2 is done).

## 2. Set up env files

Env files are not committed. They live once in `.git/arbor-env/` and are
symlinked into every worktree. Follow the "First-time setup" section of the
root [README](../README.md), then run:

```bash
pnpm setup:worktree-env
```

See [environment-variables.md](environment-variables.md) for what each
variable does and where it must be set.

## 3. Start the backend

```bash
pnpm --filter backend dev
```

The first run provisions a Convex dev deployment and writes
`packages/backend/.env.local` with `CONVEX_DEPLOYMENT` and `CONVEX_URL`.
Leave this running: it watches `packages/backend/convex/` and pushes changes.

Set the backend env vars (Better Auth, Resend, R2, Immich) in the Convex
dashboard for this deployment — see [environment-variables.md](environment-variables.md).

## 4. Create the first admin account

There is no self-serve sign-up. With the web app running and **no admin** yet,
open `/setup` directly. Fill in name, email, and password to create the first
admin and the Arbor Live organization.

Once any admin exists, `/setup` locks permanently and redirects to sign-in.
Additional users are invited from the app (Users section) via email invites;
new crew land on `/onboarding` after accepting.

## 5. Start the web app

In another terminal:

```bash
pnpm dev:web
```

Visit `http://localhost:3000/setup` for first-admin bootstrap (fresh
deployment only), or `/sign-in` after an admin exists, then the dashboard.

## Dev preview wizards

When iterating on first-admin setup or crew/band onboarding UI, local
development exposes a floating **Dev** menu (bottom-right) that opens:

| Wizard | URL |
|---|---|
| First-admin setup | `/setup?devPreview=1` |
| Crew onboarding | `/onboarding?devPreview=1` |
| Band onboarding | `/onboarding/band?devPreview=1` |

`?devPreview=1` only works when `NODE_ENV === "development"`. In production
builds the query param is ignored and the Dev menu is not rendered.

What it does:

- Skips **client-side** redirects that would otherwise bounce you away (setup
  already locked, onboarding completed/waived, wrong role).
- Lets you walk the wizard UI without a matching onboarding row (mutations are
  skipped in that case — UI-only).
- Does **not** bypass Convex auth or server-side mutation guards. Crew/band
  routes still require a signed-in session.

Do not rely on this for production testing, and never ship a build with
`NODE_ENV=development`.

## Common failure modes

| Symptom | Likely cause |
|---|---|
| `ctx.auth.getUserIdentity()` always null / sign-in loops | `BETTER_AUTH_SECRET` or `SITE_URL` not set on the Convex deployment |
| Web build fails with "Convex URL missing at build time" | `NEXT_PUBLIC_CONVEX_URL` missing; run `pnpm --filter backend dev` first or see [deployment.md](deployment.md) |
| Type errors referencing `_generated` | Stale codegen — run `pnpm --filter backend codegen` |
| Emails never send | `RESEND_API_KEY` / `EMAIL_FROM` unset, or `EMAIL_TEST_MODE` is on |
| Image upload/serving broken | R2 vars unset — see [r2-storage.md](r2-storage.md) |

## Day-to-day commands

| Command | What it does |
|---|---|
| `pnpm dev:web` | Next.js dev server (apps/web) |
| `pnpm dev:backend` | Convex dev (watch + push) |
| `pnpm dev:email` | react-email preview server on port 3001 |
| `pnpm codegen:backend` | Regenerate Convex bindings after schema/API changes |
| `pnpm lint` / `pnpm typecheck` | Lint / typecheck all workspace packages |
| `pnpm --filter web build` | Full Next.js production build (best cross-file type check) |
| `pnpm test:e2e` | Boot anonymous Convex + Next, then run Playwright (`E2E_SKIP_BOOT=1` to reuse a running stack) |

CI runs the same suite on PRs and pushes to `main` (`.github/workflows/e2e.yml`) with `CONVEX_AGENT_MODE=anonymous` and `E2E_EMAIL_MOCK` so Resend is never called. Coverage by app section: [e2e-coverage.md](e2e-coverage.md).
Note: root `pnpm dev` runs *every* package's `dev` script in parallel,
including the email preview server. Use the targeted `dev:web` / `dev:backend`
scripts if you only want the app.

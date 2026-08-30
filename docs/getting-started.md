# Getting Started

How to go from a fresh clone to a working local app with an admin account.

## Prerequisites

- Node.js 20+ and pnpm 10 (the repo pins pnpm via `packageManager`)
- A Convex account only for the shared worktrunk; isolated per-worktree
  backends run anonymously with no login

## Quick path (any worktree)

```bash
pnpm install
pnpm setup:worktree-env    # one time per worktree
pnpm run dev
```

`setup:worktree-env` links env files, boots an isolated local Convex for this
worktree, sets its deployment env, and seeds a loginable admin plus crew/band
accounts and demo data (an event with a schedule, a quote in the funnel). When
it finishes it prints this worktree's web port and the seeded credentials —
all seeded accounts share the printed password. `pnpm run dev` then starts the
backend and web app on this worktree's own ports, so parallel worktrees never
collide.

On the main checkout there is nothing to isolate; the script only links env
files and repairs `packages/backend/.env`, then prints the manual trunk steps
below.

## Manual trunk setup (main checkout / shared data)

### 1. Install dependencies

```bash
pnpm install
```

`pnpm install` also runs the `prepare` script, which configures git hooks and
tries to link env files (it swallows errors on a fresh clone — that's expected
until step 2 is done).

### 2. Set up env files

Env files are not committed. They live once in `.git/arbor-env/` and are
symlinked into every worktree. `pnpm setup:worktree-env` seeds them from the
`.env.example` files, strips placeholder CONVEX URLs, and generates
`BETTER_AUTH_SECRET` if missing.

See [environment-variables.md](environment-variables.md) for what each
variable does and where it must be set.

### 3. Start the backend

```bash
pnpm dev:backend
```

This runs `convex dev` against the **worktrunk** — the shared cloud dev
deployment that every worktree symlinks to (see
[Worktrunk vs. local Convex](#worktrunk-vs-local-convex)). The first run
provisions the Convex dev deployment and writes
`packages/backend/.env.local` with `CONVEX_DEPLOYMENT` and `CONVEX_URL`.
Leave this running: it watches `packages/backend/convex/` and pushes changes.

Set the backend env vars (Better Auth, Resend, R2, Immich) in the Convex
dashboard for this deployment — see [environment-variables.md](environment-variables.md).

### 4. Create the first admin account

There is no self-serve sign-up. With the web app running and **no admin** yet,
open `/setup` directly. Fill in name, email, and password to create the first
admin and the Arbor Live organization.

Once any admin exists, `/setup` locks permanently and redirects to sign-in.
Additional users are invited from the app (Users section) via email invites;
new crew land on `/onboarding` after accepting.

### 5. Start the web app

In another terminal:

```bash
pnpm dev:web
```

Visit `http://localhost:3000/setup` for first-admin bootstrap (fresh
deployment only), or `/sign-in` after an admin exists, then the dashboard.

## Worktrunk vs. local Convex

Every git worktree gets one of two Convex backends. Which one a worktree uses
is recorded per-worktree in `.git/arbor-env/worktree-convex.json` and restored
automatically on checkout (`scripts/worktree-convex.mjs ensure`).

### Worktrunk (default)

`packages/backend/.env.local` is a **symlink** into `.git/arbor-env/`, so every
worktree shares one cloud dev deployment and one database. Use it only when you
want shared data, or in the main checkout.

```bash
pnpm worktree-convex trunk   # select the shared trunk .env.local
pnpm dev:backend             # convex dev against the shared trunk deployment
```

### Local Convex (feature work)

Each worktree runs its **own anonymous Convex backend** on its own ports
(`:3210`/`:3211` for the first worktree, then `:3220`/`:3221`, `:3230`/`:3231`,
…), and gets its **own Next.js port** (from :3000 up). `.env.local` files become
**real per-worktree files**, so schema pushes and data never collide with the
trunk or another worktree. **All non-trunk feature work — a single agent or
many, on any feature branch — must use this mode** so schema pushes never
target the shared trunk deployment.

```bash
pnpm setup:worktree-env    # switch to local mode, boot, set deployment env,
                           # seed accounts + demo data (one time per worktree)
pnpm run dev               # backend + web on this worktree's ports
```

| Command | What it does |
|---|---|
| `pnpm worktree-convex status` | Show this worktree's mode, ports, and `.env.local` files |
| `pnpm worktree-convex local` | Switch this worktree to isolated local Convex (no boot) |
| `pnpm worktree-convex trunk` | Switch back to the shared worktrunk |
| `pnpm setup:worktree-env` | Full local bootstrap: ports + boot + deployment env + seed |
| `pnpm dev:backend:local` | Local mode + boot + bootstrap deployment env (no seed) |
| `pnpm dev:backend` | `convex dev` in this worktree's current mode |

Ports are allocated once per worktree and reused, so restarts are stable. Each
worktree's deployment config lives in its own gitignored
`packages/backend/.convex/`. A local backend only needs the shared `.env`
secrets plus the three vars the bootstrap sets; R2 / Immich / Resend features
degrade gracefully without them.

Re-running `pnpm setup:worktree-env` is safe: it re-uses this worktree's ports,
re-asserts the deployment env, and re-seeds (account upserts; demo data rows
are appended).

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
| Web build fails with "Convex URL missing at build time" | `NEXT_PUBLIC_CONVEX_URL` missing; run `pnpm dev:backend` first or see [deployment.md](deployment.md) |
| Type errors referencing `_generated` | Stale codegen — run `pnpm --filter backend codegen` |
| Emails never send | `RESEND_API_KEY` / `EMAIL_FROM` unset, or `EMAIL_TEST_MODE` is on |
| Image upload/serving broken | R2 vars unset — see [r2-storage.md](r2-storage.md) |

## Day-to-day commands

| Command | What it does |
|---|---|
| `pnpm run dev` | Backend + web dev servers on this worktree's own ports |
| `pnpm dev:web` | Next.js dev server (apps/web) on the worktree port |
| `pnpm dev:backend` | Convex dev in this worktree's mode (trunk by default) |
| `pnpm dev:backend:local` | Switch to isolated local Convex and boot it (parallel agents) |
| `pnpm setup:worktree-env` | Full local bootstrap: ports + boot + deployment env + seeded accounts/data |
| `pnpm prune` | Remove worktrees whose PR is merged or that have been idle 7+ days (`--dry-run` to preview, `--force` to include dirty ones) |
| `pnpm dev:email` | react-email preview server on port 3001 (opt-in, not part of `pnpm run dev`) |
| `pnpm codegen:backend` | Regenerate Convex bindings after schema/API changes |
| `pnpm lint` / `pnpm typecheck` | Lint / typecheck all workspace packages |
| `pnpm --filter web build` | Full Next.js production build (best cross-file type check) |
| `pnpm test:e2e` | Boot **anonymous** local Convex + Next, then run Playwright. Writes anonymous config to `packages/backend/.env.local` (Convex requires that path); locally stashes any prior cloud `.env.local` and restores it on exit. Opt into shared cloud Dev with `E2E_USE_CLOUD_DEV=1` or `CONVEX_AGENT_MODE=cloud`. `E2E_SKIP_BOOT=1` reuses a running stack (warns if that stack is cloud). |

CI runs the same suite on PRs and pushes to `main` (`.github/workflows/e2e.yml`) with `CONVEX_AGENT_MODE=anonymous` and `E2E_EMAIL_MOCK` so Resend is never called. Local `pnpm test:e2e` defaults to the same anonymous mode (stashes/restores cloud `.env.local`) so personal devices do not burn team-plan Database I/O. Coverage by app section: [e2e-coverage.md](e2e-coverage.md).
Note: root `pnpm run dev` starts the app (backend + web) on this worktree's own
ports. The email preview server is opt-in via `pnpm dev:email`.

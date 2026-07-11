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

Set the backend env vars (Better Auth, Resend, R2, Immich, bootstrap secret)
in the Convex dashboard for this deployment — see
[environment-variables.md](environment-variables.md).

## 4. Create the first admin account

There is no self-serve sign-up. The first admin is created via the
`bootstrapAdmin` mutation in `packages/backend/convex/bootstrap.ts`, gated by
the `BOOTSTRAP_ADMIN_SECRET` env var on the Convex deployment:

```bash
cd packages/backend
npx convex run bootstrap:bootstrapAdmin '{
  "secret": "<value of BOOTSTRAP_ADMIN_SECRET>",
  "email": "you@example.com",
  "password": "a-strong-password",
  "name": "Your Name"
}'
```

This creates the user with the `admin` role, a credential account, the
"Arbor Live" internal organization, and all required memberships. Once an
admin exists, bootstrap refuses to mint a different admin — re-running it for
the same email is allowed (idempotent), any other email is rejected.

Additional users are invited from the app (Users section) via email invites.

## 5. Start the web app

In another terminal:

```bash
pnpm dev:web
```

Visit `http://localhost:3000`, sign in at `/sign-in` with the bootstrap
credentials, and you should land on the dashboard.

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

Note: root `pnpm dev` runs *every* package's `dev` script in parallel,
including the email preview server. Use the targeted `dev:web` / `dev:backend`
scripts if you only want the app.

# Arbor Live Portal

Monorepo bootstrap for:
- `apps/web`: Next.js + shadcn/ui frontend
- `packages/backend`: Convex backend + Better Auth (local install)

## Setup

Env files are **not** committed. They live once in `.git/arbor-env/` and are
symlinked into every worktree by `pnpm setup:worktree-env`.

### First-time setup (main checkout)

1. Install dependencies: `pnpm install`
2. Create shared env files (edit with real values before running the app):

```bash
SHARED_ENV="$(git rev-parse --git-common-dir)/arbor-env"
mkdir -p "$SHARED_ENV/apps/web" "$SHARED_ENV/packages/backend"
cp apps/web/.env.example "$SHARED_ENV/apps/web/.env"
cp packages/backend/.env.example "$SHARED_ENV/packages/backend/.env"
# Edit $SHARED_ENV/packages/backend/.env — set BETTER_AUTH_SECRET, RESEND_API_KEY, etc.
```

3. Link env into this checkout: `pnpm setup:worktree-env`
4. Start Convex (writes `packages/backend/.env.local` with `CONVEX_DEPLOYMENT`):

```bash
pnpm --filter backend dev
```

5. In another terminal: `pnpm dev:web`

### Worktrees

Run `pnpm setup:worktree-env` in each new worktree (or rely on the `post-checkout`
git hook after `pnpm install` in the main checkout).

If linking reports missing files:

| File | How it gets created |
|------|---------------------|
| `packages/backend/.env` | Copy from `.env.example` into shared store (step 2 above) |
| `packages/backend/.env.local` | `pnpm --filter backend dev` (Convex CLI) |
| `apps/web/.env` | Copy from `apps/web/.env.example` into shared store |
| `apps/web/.env.local` | Optional — not required if `apps/web/.env` exists |
| `apps/web/.env.production.local` | Written during `pnpm --filter web build` |

`pnpm prepare` runs the linker but **swallows errors**. If envs are missing, run
`pnpm setup:worktree-env` explicitly and read its output.


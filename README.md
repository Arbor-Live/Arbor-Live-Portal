# Arbor Live Portal

Monorepo bootstrap for:
- `apps/web`: Next.js + shadcn/ui frontend
- `packages/backend`: Convex backend + Better Auth (local install)

## Setup

1. Copy env templates (main checkout only — worktrees share these automatically):
   - `cp apps/web/.env.example apps/web/.env.local`
   - `cp packages/backend/.env.example packages/backend/.env.local`
2. Install dependencies:
   - `pnpm install`
3. Configure Convex deployment locally in `packages/backend`:
   - `pnpm --filter backend dev`
4. Generate Better Auth local schema:
   - `pnpm --filter backend auth:generate`
5. Start web app:
   - `pnpm dev:web`

## Git worktrees

Gitignored env files are stored once in `.git/arbor-env/` and symlinked into every
worktree. `pnpm install` configures the shared git hook and links env files; to
link manually:

```bash
pnpm setup:worktree-env
```

If you add a new worktree, run `pnpm setup:worktree-env` in it (or check out a
branch — the `post-checkout` hook does this automatically).


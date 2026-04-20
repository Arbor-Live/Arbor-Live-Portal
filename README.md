# Arbor Live Portal

Monorepo bootstrap for:
- `apps/web`: Next.js + shadcn/ui frontend
- `packages/backend`: Convex backend + Better Auth (local install)

## Setup

1. Copy env templates:
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


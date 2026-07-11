# web — Arbor Live Portal frontend

Next.js (App Router) frontend for the Arbor Live Portal monorepo. It does not
run standalone: it needs env files linked and the Convex backend running.

## Running locally

From the **repo root** (not this folder):

```bash
pnpm install
pnpm setup:worktree-env        # link env files (first-time setup: see root README)
pnpm --filter backend dev      # terminal 1: Convex backend
pnpm dev:web                   # terminal 2: this app on http://localhost:3000
```

Full walkthrough (including creating the first admin):
[docs/getting-started.md](../../docs/getting-started.md).

## Useful scripts (run with `pnpm --filter web <script>`)

| Script | What it does |
|---|---|
| `dev` | Next.js dev server |
| `build` | Materializes `NEXT_PUBLIC_CONVEX_*` env then `next build` |
| `lint` | ESLint |
| `typecheck` | `tsc --noEmit` |

## Layout

- `src/app/` — routes: `dashboard/` (staff app), `public/` (booking wizard,
  quote pages), marketing pages, auth pages.
- `src/components/` — feature components by domain; `ui/` holds shadcn
  primitives.
- `src/lib/convex-api.ts` — re-exports the generated Convex API used
  everywhere as `@/lib/convex-api`.
- `src/lib/validations/` — zod schemas shared by forms and server actions.

More context: [docs/architecture.md](../../docs/architecture.md) and
[docs/deployment.md](../../docs/deployment.md).

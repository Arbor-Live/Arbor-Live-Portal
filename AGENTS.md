<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

The active Convex project lives in `packages/backend/convex`. When working on
Convex code, **always read
`packages/backend/convex/_generated/ai/guidelines.md` first** for important
guidelines on how to correctly use Convex APIs and patterns. The file contains
rules that override what you may have learned about Convex from training data.

Convex agent skills and guidance can be refreshed by running
`npx convex ai-files install` from `packages/backend`.

<!-- convex-ai-end -->

## Cursor Cloud specific instructions

This is a pnpm monorepo (`apps/web` = Next.js 16 frontend, `packages/backend` =
Convex + Better Auth). Standard commands and the full local runbook live in
`docs/getting-started.md`. The notes below cover only the non-obvious caveats for
running it inside a fresh cloud VM, where there is no Convex login and env files
are not committed.

### Services (both required to use the app)

- Backend: `packages/backend`, started with `convex dev`. This is the only
  stateful service (Convex DB + Better Auth live inside it).
- Web: `apps/web`, started with `pnpm dev:web` (Next.js on `http://localhost:3000`).

`pnpm install` is the only startup dependency step (it also runs the `prepare`
hook that symlinks the gitignored env files from `.git/arbor-env/`). Everything
below (running services, deployment env vars, admin bootstrap) is one-time per
fresh deployment and must be done by hand — the local Convex deployment and its
data are ephemeral and do not survive a fresh VM.

### Running the backend without a Convex account

Use anonymous agent mode — no login required. It provisions a local Convex
backend on `http://127.0.0.1:3210` (HTTP actions on `:3211`) and writes
`packages/backend/.env.local`:

```bash
cd packages/backend
CONVEX_AGENT_MODE=anonymous npx convex dev   # leave running (watch + push)
```

### GOTCHA: fix the seeded backend `.env` before starting web

`pnpm install` seeds `packages/backend/.env` from `.env.example`, which contains
placeholder `CONVEX_CLOUD_URL` / `CONVEX_SITE_URL` values
(`https://your-convex-deployment.convex.*`). The web app's `next.config.ts`
loads `.env` before `.env.local` and only keeps the first value it sees, so those
placeholders shadow the real local URLs and break sign-in (auth points at a
non-existent `.convex.site` domain). Comment out / remove those two lines in
`packages/backend/.env` so the local URLs from `.env.local` win. Local dev only
needs `BETTER_AUTH_SECRET`, `SITE_URL=http://localhost:3000`, and
`EMAIL_TEST_MODE=true` (dry-run email; avoids needing Resend). R2 / Immich are
optional and their features degrade gracefully.

### Deployment env vars are separate from `.env`

Convex functions read `process.env` from the **deployment's** env vars, not the
local `.env` file. After `convex dev` is up, set them on the deployment:

```bash
cd packages/backend
export CONVEX_AGENT_MODE=anonymous
npx convex env set BETTER_AUTH_SECRET "<secret>"
npx convex env set SITE_URL "http://localhost:3000"
npx convex env set EMAIL_TEST_MODE "true"
```

### First admin (no self-serve signup)

With the web app running and zero admins on the deployment, open `/setup`
directly to create the first admin account. `/setup` locks permanently once
any admin exists. Invite additional users from the Users dashboard; they land
on `/onboarding` after accept-invite.

To re-open setup / crew / band onboarding UIs after they would normally
redirect away, use the floating **Dev** menu (or `?devPreview=1`) — local
`NODE_ENV=development` only. Details: `docs/getting-started.md` (“Dev preview
wizards”).

### Non-obvious runtime notes

- After schema/backend API edits, run `pnpm --filter backend codegen` (or just
  keep `convex dev` running, which pushes automatically).

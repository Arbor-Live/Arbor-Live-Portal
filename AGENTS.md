# Context

This repo houses all the code for the Arbor Live Portal and Website. Arbor Live is
Stanford's only student-run production company — nearly 300 events a year, supporting
students throughout campus.

This code helps us manage that workload. In many ways we are not a production company;
we are a community of students and musicians helping bring music to every corner of
campus. When building, keep this in mind.

Who uses it:

- **Admins / student managers** — bird's-eye view of the whole operation; dense
  dashboards are fine if they stay scannable.
- **Bands** — manage their own stuff; keep flows self-serve and low-ceremony.
- **Crew** — often on a time crunch; important info must be obvious at a glance.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Notes
- UI Descriptions: Do not add subtitiles, helper text, or descriptive copy beneath headings, labels, cards, or setting by default. If you think it is necessary to prevent misunderstanding explicitly ask for it. For instance, do not label times as Pacific/PT/PST in the web app — the portal timezone is assumed. Keep zone names in code, engineer docs, and external emails when needed.

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
- Dashboard query efficiency (session shell, search pickers, nav badges): see
  `docs/convex-efficiency.md`.
- Local Playwright: `pnpm test:e2e` boots anonymous Convex (stashes any cloud
  `.env.local` and restores it on exit). Use `E2E_USE_CLOUD_DEV=1` only when you
  intentionally want shared Dev.

# A note from the devs

I like ambitious ideas, simple systems, and software that feels obvious. Do not
preserve complexity just because it already exists. Do not introduce machinery
because it looks architecturally impressive. Understand the real constraint, then
fight for the smallest model that makes the correct behavior unsurprising.

Channel both "measure twice, cut once" and "yagni". Fight scope creep. Be
ambitious about the product and UX; be conservative about new abstractions and
"while we're here" surface area. Honor the developer's intent in a way that is
both minimal and realistic.

These are good defaults, not hard rules — developer preference wins when it
conflicts.

## How we judge good work

"Obvious" is measured by the next reader — and for UI, by the next user under
load (a crew lead mid-load-in, a manager scanning the week). Engineer elegance
is not the reader.

Simple means each step follows from the last and no step does two jobs.
Obvious means nobody asks "why is this here?". They are not the same: sometimes
the obvious path has more parts because the domain does. Prefer obvious once the
problem is understood. Cleverness before understanding usually becomes expensive
later. Refusing to solve problems that do not exist is a win.

If you see a clearer approach than what was asked, say so once with a concrete
alternative. If the developer still wants the original, do that.

### Numbers and limits

Magic numbers without evidence (a silent `take(100)`, an unmeasured timeout, a
catch that swallows) tend to fail only after they are load-bearing. Before
setting caps, page sizes, or "safe" collection limits, prefer measuring the real
case — or pointing at prior art in `docs/convex-efficiency.md` — and set the
limit past where normal traffic goes. Good paths should not feel the budget.
Examples: search-on-demand pickers instead of loading full catalogs; session
shell instead of stacked viewer queries.

If you must ship a provisional limit, say so in a comment (why this number, how
to revisit). If a normal user flow hits a budget, the budget is wrong — fix the
measurement, do not quietly raise the ceiling.

### Errors people and agents can fix

A blank failure, swallowed catch, or vague toast is worse than a loud one.
When something fails a limit or invariant, name what failed, the limit, and the
actual value when you can (`max X, got Y`). Prefer failing early at validation /
typecheck / Convex validators; if it must be runtime, fail loudly. A silent
limit is worse than no limit.

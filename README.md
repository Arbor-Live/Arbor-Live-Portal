<p align="center">
  <img src="docs/assets/readme-logo.svg" alt="Arbor Live" width="560">
</p>

# Arbor Live Portal

The operations platform behind [Arbor Live](https://arborlive.stanford.edu) — Stanford's student-run production company. We produce nearly 300 campus events a year, and this is the software that keeps scheduling, staffing, billing, inventory, and our public-facing site in one place.

Built for three audiences:

- **Staff / managers** — run the whole operation from a single dashboard: events, crew, quotes, invoices, inventory, marketing, and insights.
- **Bands & performers** — self-serve portal for show details, media, and payouts.
- **Crew** — shift assignments, availability, and the info they need on load-in day.

## What it does

| Area | Highlights |
|------|------------|
| **Events** | Scheduling with setup/show/strike blocks, crew shifts, venues, series, expenses, pull lists, and Wing show-file export |
| **Booking** | Public request wizard → staff review → quote → client approval (token links, no account required) |
| **Financial** | Quotes & invoices with PDF generation, payment proof collection, host organizations, and band payout agreements |
| **Inventory** | Equipment catalog, packages, storage locations, lost-and-found QR pages |
| **People** | Invite-only auth, crew/band onboarding, applications, compensation rates, and team verticals |
| **Marketing** | Public event listings, artist/crew pages, short links, and optional Immich photo galleries |
| **Email** | Transactional templates (react-email) for quotes, shifts, reminders, and onboarding |

The public marketing site and authenticated dashboard share the same Next.js app and Convex backend.

## Tech stack

- **Frontend:** [Next.js](https://nextjs.org) 16 (App Router), [shadcn/ui](https://ui.shadcn.com), [Tailwind CSS](https://tailwindcss.com)
- **Backend:** [Convex](https://convex.dev) (database, functions, crons, HTTP actions)
- **Auth:** [Better Auth](https://www.better-auth.com) (organizations, invites, admin roles) running inside Convex
- **Documents:** `@arbor/invoice-document` — shared invoice/quote models with web and PDF renderers
- **Integrations (optional):** [Resend](https://resend.com) (email), [Cloudflare R2](https://www.cloudflare.com/r2/) (file storage), [Immich](https://immich.app) (event/band galleries)

## Monorepo layout

```
apps/
  web                  Next.js frontend (dashboard + public site)
packages/
  backend              Convex backend + Better Auth
  email                @arbor/email — react-email templates + ICS
  format               @arbor/format — dates, money, Pacific-time helpers
  invoice-document     Invoice/quote PDF + web rendering
  rider-document       Rider PDF generation
  show-file            Wing console show-file generation
```

## Quick start

**Prerequisites:** Node.js 20+, pnpm 10, and a [Convex](https://convex.dev) account.

```bash
pnpm install
# Set up env files — see docs/getting-started.md
pnpm setup:worktree-env
pnpm --filter backend dev    # terminal 1 — Convex dev server
pnpm dev:web                 # terminal 2 — http://localhost:3000
```

On a fresh deployment with no admins, visit `/setup` to create the first admin account. Everyone else is invited by email.

Full walkthrough (env vars, first admin, dev preview wizards): **[docs/getting-started.md](docs/getting-started.md)**

## Documentation

- [docs/getting-started.md](docs/getting-started.md) — clone to running app, first admin account
- [docs/architecture.md](docs/architecture.md) — workspace map, backend module tour, auth model
- [docs/domain-guide.md](docs/domain-guide.md) — events, booking requests, quotes/invoices, band payments, inventory
- [docs/environment-variables.md](docs/environment-variables.md) — every env var and where it lives
- [docs/deployment.md](docs/deployment.md) — Vercel + Convex deploy pipeline and triage
- [docs/r2-storage.md](docs/r2-storage.md) — Cloudflare R2 file storage setup
- [docs/immich.md](docs/immich.md) — Immich media albums & share links for event/band galleries
- [docs/resend-email.md](docs/resend-email.md) — Resend transactional sends & inbound confirmation webhook
- [docs/wing-show-files.md](docs/wing-show-files.md) — Wing show file generation: night patch, two snakes, snapshot scoping

## Development

```bash
pnpm typecheck          # TypeScript across workspaces
pnpm lint               # ESLint across workspaces
pnpm test               # Vitest unit tests
pnpm test:e2e           # Playwright (boots anonymous Convex)
pnpm --filter backend codegen   # Regenerate Convex bindings after schema/API changes
```

Env files are **not** committed. They live once in `.git/arbor-env/` and are symlinked into every worktree by `pnpm setup:worktree-env`. See the setup section in [docs/getting-started.md](docs/getting-started.md) for the full env workflow.

### Worktree env files

| File | How it gets created |
|------|---------------------|
| `packages/backend/.env` | Copy from `.env.example` into shared store |
| `packages/backend/.env.local` | `pnpm --filter backend dev` (Convex CLI) |
| `apps/web/.env` | Copy from `apps/web/.env.example` into shared store |
| `apps/web/.env.local` | Optional — not required if `apps/web/.env` exists |
| `apps/web/.env.production.local` | Written during `pnpm --filter web build` |

`pnpm prepare` runs the linker but **swallows errors**. If envs are missing, run `pnpm setup:worktree-env` explicitly and read its output.

## License

Dual-licensed:

- **[GNU Affero General Public License v3.0](LICENSE)** — you may use, modify, and distribute this software under the AGPL. If you run a modified version as a network service, the AGPL requires you to offer corresponding source to users who interact with it over the network.
- **[Commercial license](COMMERCIAL-LICENSE.md)** — for-profit use (paid hosting, SaaS, white-label sales, or other revenue-generating products built on this code) requires a separate license from Arbor Live. Email [arborlive@stanford.edu](mailto:arborlive@stanford.edu).

Copyright © Arbor Live.

## Contributing

Issues and pull requests are welcome. This codebase grew around Arbor Live's real workflows — event production, Stanford billing, and student staffing — so some pieces are opinionated. Read [docs/architecture.md](docs/architecture.md) and [docs/domain-guide.md](docs/domain-guide.md) before larger changes.

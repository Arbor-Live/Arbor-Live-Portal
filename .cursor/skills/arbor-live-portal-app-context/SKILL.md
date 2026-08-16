---
name: arbor-live-portal-app-context
description: Core implementation context for Arbor Live Portal (Next.js + Convex), including event scheduling, staffing, invoice/quote lifecycle, and UI conventions. Use when making feature changes, bug fixes, or refactors in this repository.
---

# Arbor Live Portal Context

## Purpose
Use this skill to quickly align with how this app is built and avoid regressions in the event/invoice domains.

Human-readable docs live in `docs/` (`getting-started.md`, `architecture.md`, `domain-guide.md`, `environment-variables.md`, `deployment.md`, `r2-storage.md`, `convex-efficiency.md`). Keep `docs/domain-guide.md` in sync when domain behavior described here changes.

## Stack and Structure
- Monorepo with `pnpm` workspaces.
- Frontend: Next.js app in `apps/web`.
- Backend: Convex in `packages/backend/convex`.
- Generated Convex bindings are consumed by web via `@/lib/convex-api`.

## Core Commands
- Install deps (repo root): `pnpm install`
- Convex type/code generation: `pnpm --filter backend codegen`
- Web lint: `pnpm --filter web exec eslint "<path>"`
- Web build check: `pnpm --filter web build`

## Convex Rules for this Repo
- Always keep argument validators on queries/mutations/actions.
- After schema or backend API changes, run `pnpm --filter backend codegen`.
- Keep queries bounded (`take(...)`), avoid unbounded collection patterns.
- Use indexes for query access paths.
- Follow `docs/convex-efficiency.md`: dashboard uses `getSessionShell` + `SessionShellProvider` / `useSessionViewer` (not stacked `getViewer` + org queries); large catalogs use search-on-demand pickers; sidebar badges use `navBadges.getNavBadges`.

## Event Domain (Current Behavior)

### Venues
- Hierarchical `venues` table (optional parent, computed path). Admin-only CRUD at `/dashboard/events/venues`.
- Events/series/requests use `venueId` + denormalized `venueName` (path). Pick via `VenuePicker` (fuzzy search + nicknames; admins can create inline).
- Nested spaces inherit address, maps URL, contact, links, and files from ancestors (own contact/links/files are additive; own address/maps override).

### Host organizations (billing / event hosts)
- Tables: `invoiceGroups`, `invoiceContacts`, `invoicePeople` (email identity), `invoiceGroupAliases`.
- Admin: `/dashboard/financial-hub/organizations` — create, aliases, merge duplicates, contacts.
- Create refuses exact/alias name collisions; staff host modals offer “Did you mean…?”.
- Booking: `searchHostOrganizationsPublic` + free-text create via `provisionBillingProfileFromRequest` (alias-aware).
- Helpers: `lib/hostOrgIdentity.ts`, `lib/invoicePeople.ts`, `lib/hostOrgs.ts` (`resolveHostLink`).
- Backfills: `@convex-dev/migrations` in `convex/migrations.ts` (`runAll` on deploy). Host-org jobs: `backfillHostOrgNormalizedNames`, `backfillInvoicePeople`.

### Event Basics
- Event types:
  - `Crewed Event`
  - `Rental with Crew`
  - `Dry Rental`
  - `Services Only`
- Teams of interest:
  - `Design`, `Marketing`, `Lighting`, `Sound`, `Operations`
- Event timezone is fixed to `America/Los_Angeles` (**entire portal**, not only events). See **Timezone (Pacific)** below.

### Scheduling
- Schedule blocks are stored in `eventScheduleBlocks`.
- Timeline supports:
  - drag/resize
  - snapping (15-minute increments)
  - overlap lane stacking (overlapping blocks render on separate rows)
  - cross-midnight rendering across day rows
  - double-click empty timetable to add a 1-hour block at that time
- New blocks default to the event **Day 1** date (not today) and a 1-hour window.
  Picking start fills end (+1h, or keeps a custom duration); picking end with no
  start fills start (−1h). The block list is ordered by start time.
- `dayIndex` is anchored to the event **start** day. Strike may run past midnight
  after an ~11pm show end without moving `events.endAt` / `spansMultipleDays`.
- Quick Add intent by event type:
  - `Dry Rental`: Delivery + Return slots
  - `Rental with Crew`: Setup + Strike
  - `Services Only`: schedule/crew tabs hidden
  - `Crewed Event`: Setup + Show + Strike
- If required dates are missing, quick-add controls should be visually disabled/blurred (not error-spammy).

### Crew and Personnel
- Crew shifts are part of schedule planning:
  - `eventCrewShifts` has optional `scheduleBlockId` linking each shift to a schedule block.
  - Personnel are managed per block in Schedule UI.
- Treat legacy unassigned shifts safely (do not crash if no `scheduleBlockId`).

### Event Costs (No Generated Expense Reports)
- Event costs are direct fields on `events`:
  - `crewCostUsd`
  - `bandsCostUsd` (band payouts / expenses — not revenue)
  - `externalRentalsCostUsd` (pass-through expense — not revenue)
- Invoice artist and external-rental lines may bill the host for transparency.
  Insights earned revenue and net profit treat them as pass-through
  (`invoicePassThroughUsd` / `arborEarnedRevenueUsd` / `netProfitFromInvoiceUsd`).
  Matching event pass-through costs are not double-counted; overruns still hit
  profit. Arbor margin is effectively equipment / crew / fees.
- In UI, costs are edited as part of event record, not via report creation workflows.

## Invoice and Public Quote Context
- Invoice numbers use `ALINV-` with a 7-character nanoid suffix (e.g. `ALINV-4K8Z2NP`).
- Booking request numbers use `ALREQ-` with the same suffix format.
- Band payment IDs use `ALBPAY-` with the same suffix format.
- Public quote link token workflow exists on invoices (`publicApprovalToken`).
- Quote approval status is unified for table display.
- Default invoice due date is the **first** linked event’s start calendar day + 30
  days (not the last day of a multi-day event or the last series occurrence).

## Timezone (Pacific)

**Everything is Pacific Time** (`America/Los_Angeles`). Never rely on the browser/OS timezone.

| Concern | Use |
|---|---|
| Constant | `PORTAL_TIMEZONE` in `packages/format` (`@arbor/format`), re-exported as `@/lib/format` |
| Display | `formatDate`, `formatDateTime`, `formatDateTimeRange` |
| ms → input string | `toPacificDateTimeInput` / `toLocalDateTimeInput` (`@/lib/crew-availability`) |
| input string → ms | `pacificDateTimeInputToMs` / `localDateTimeInputToMs` / `requireLocalDateTimeInputMs` |
| Calendar day key | `pacificDateKey` |
| Date + `HH:mm` | `pacificDateAndTimeToMs` |
| FullCalendar grids | `timeZone={PORTAL_TIMEZONE}` (dashboard events calendar) |

**UI copy:** Do not label times as Pacific/PT/PST in the web app — the portal timezone is assumed. Keep zone names in code, engineer docs, and external emails when needed.

**Avoid:** bare `toLocaleString` / `toLocaleDateString`; `new Date(datetimeLocalString).getTime()` for saves; extracting wall clock from instants with `getHours()` / `getFullYear()`.

`DateTimePicker` stores naive `YYYY-MM-DDTHH:mm` digits; those digits are Pacific wall clock and must cross the ms boundary only via the helpers above.

Cursor rule: `.cursor/rules/portal-timezone.mdc` (always applied).

## Date/Time UX Conventions
- Avoid native `datetime-local` picker popovers for core event UX.
- Use themed app picker component: `apps/web/src/components/ui/date-time-picker.tsx`.
- Enforce 15-minute increments in picker configuration.
- Prevent input layout shift from focus/popup styling.

## Select/Dropdown UI Conventions
- **Searchable lists must use `SearchableSelect`**
  (`apps/web/src/components/inventory/searchable-select.tsx`). Do not use native
  `<select>` for searchable / long option lists (events, venues, users, blocks,
  packages, invoices, etc.).
- Prefer domain wrappers that already wrap `SearchableSelect`:
  - Events: `apps/web/src/components/events/event-select.tsx` (`EventSelect`)
  - Users: `apps/web/src/components/users/user-select.tsx` (`UserSelect`)
  - Venues: `apps/web/src/components/venues/venue-picker.tsx` (`VenuePicker`)
- Schedule-block + start/end windows (crew availability partial responses and
  trainee assign): reuse
  `apps/web/src/components/events/schedule-block-window-fields.tsx`
  (`ScheduleBlockWindowFields`) — it already uses `SearchableSelect` +
  `DateTimePicker`.
- Global form consistency: dropdown/select controls should match text input visual system.
- User avatars: use `@/components/account/user-avatar` (`UserAvatar` / `BoringUserAvatar`).
  Do not import `boring-avatars` directly. Seed is stable — account email, else user id,
  else display name (see module docs in that file).

## Recent High-Risk Areas
- Event editor state hydration can overwrite in-progress edits if not guarded.
  - Prefer one-time hydration per loaded event id.
- Start/end date coupling:
  - End should auto-fill from Start by default, but stop auto-overwriting after user explicitly edits End.
- Ensure schedule save and personnel save order does not lose `scheduleBlockId` references.

## Files to Inspect First for Event Work
- `apps/web/src/components/events/event-editor.tsx`
- `apps/web/src/components/events/event-timeline-scheduler.tsx`
- `packages/backend/convex/schema.ts`
- `packages/backend/convex/events.ts`
- `packages/backend/convex/eventSchedule.ts`
- `packages/backend/convex/eventCrew.ts`

## Agent Workflow for Changes
1. Read relevant frontend + Convex files first.
2. Apply minimal schema/API/UI changes needed.
3. Run `pnpm --filter backend codegen` after backend/schema edits.
4. Lint touched web files.
5. Run `pnpm --filter web build` for confidence on cross-file typing.
6. Report changed files, behavior changes, and any known follow-ups.

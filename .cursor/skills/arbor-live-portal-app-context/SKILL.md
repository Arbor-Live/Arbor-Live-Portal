---
name: arbor-live-portal-app-context
description: Core implementation context for Arbor Live Portal (Next.js + Convex), including event scheduling, staffing, invoice/quote lifecycle, and UI conventions. Use when making feature changes, bug fixes, or refactors in this repository.
---

# Arbor Live Portal Context

## Purpose
Use this skill to quickly align with how this app is built and avoid regressions in the event/invoice domains.

Human-readable docs live in `docs/` (`getting-started.md`, `architecture.md`, `domain-guide.md`, `environment-variables.md`, `deployment.md`, `r2-storage.md`). Keep `docs/domain-guide.md` in sync when domain behavior described here changes.

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

## Event Domain (Current Behavior)

### Venues
- Hierarchical `venues` table (optional parent, computed path). Admin-only CRUD at `/dashboard/events/venues`.
- Events/series/requests use `venueId` + denormalized `venueName` (path). Pick via `VenuePicker` (fuzzy search + nicknames; admins can create inline).

### Event Basics
- Event types:
  - `Crewed Event`
  - `Rental with Crew`
  - `Dry Rental`
  - `Services Only`
- Teams of interest:
  - `Design`, `Marketing`, `Lighting`, `Sound`, `Operations`
- Event timezone is fixed to `America/Los_Angeles` in backend logic.

### Scheduling
- Schedule blocks are stored in `eventScheduleBlocks`.
- Timeline supports:
  - drag/resize
  - snapping (15-minute increments)
  - overlap lane stacking (overlapping blocks render on separate rows)
  - cross-midnight rendering across day rows
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
  - `bandsCostUsd` (placeholder)
  - `externalRentalsCostUsd` (placeholder)
- In UI, costs are edited as part of event record, not via report creation workflows.

## Invoice and Public Quote Context
- Invoice numbers use `ALINV-` with a 7-character nanoid suffix (e.g. `ALINV-4K8Z2NP`).
- Booking request numbers use `ALREQ-` with the same suffix format.
- Public quote link token workflow exists on invoices (`publicApprovalToken`).
- Quote approval status is unified for table display.

## Date/Time UX Conventions
- Avoid native `datetime-local` picker popovers for core event UX.
- Use themed app picker component: `apps/web/src/components/ui/date-time-picker.tsx`.
- Enforce 15-minute increments in picker configuration.
- Prevent input layout shift from focus/popup styling.

## Select/Dropdown UI Conventions
- Global form consistency: dropdown/select controls should match text input visual system.
- Reusable searchable select exists at `apps/web/src/components/inventory/searchable-select.tsx`.
- User picker should use boring avatar style consistent with sidebar (`boring-avatars`).

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

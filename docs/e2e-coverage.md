# Playwright e2e coverage

Living map of what the Playwright suite covers vs shipped app surfaces.
Update this file whenever specs or helpers land (or when a batch ships).

- Specs: [`apps/web/e2e/`](../apps/web/e2e/)
- Seeds/asserts: [`packages/backend/convex/e2eHelpers.ts`](../packages/backend/convex/e2eHelpers.ts)
- Runner: `pnpm test:e2e` ([`scripts/e2e-run.mjs`](../scripts/e2e-run.mjs))
- CI: [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml)

**Last updated:** 2026-07-25 (Batches 1–3 landed; Batch 4–5 green locally, uncommitted; 6 planned)

## Batch history

| Batch | PR | What landed |
|-------|-----|-------------|
| **1** | [#54](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/54) | Auth, invite accept, event create/schedule, public quote smoke + approve/changes/payment-proof submit, crew availability→assign, email queue, booking track-approve |
| **2** | [#56](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/56) | Staff booking convert, dry-hire delivery+return scans, damage triage, band e-sign→mark paid (helper), public crew apply→admin list |
| **3** | [#61](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/61) | Public booking submit, staff invoice create→public link, staff payment-proof verify, band apply+approve, venue create+pick |
| **4** | local (uncommitted) | Crew application triage (turn away / convert / trainee assign), crew `/onboarding` completion, band `/onboarding/band` completion |
| **5** | local (uncommitted) | Pull-list edit (qty + add type), damage report create, crew scheduling board, event series create |
| **6** | planned | Secondary surfaces — see [Planned batches](#planned-batches-6) |

## Status legend

| Status | Meaning |
|--------|---------|
| Covered | Happy-path Playwright assertion exists |
| Partial | Some of the flow is covered; important steps missing |
| None | Shipped UI/API with no e2e yet |
| Deferred | Intentionally out of suite (flaky, external deps, low ROI) |

---

## Coverage by section

### Auth and access

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Admin `storageState` → `/dashboard` | Covered | `smoke/auth.spec.ts` |
| Invite accept → onboarding | Covered | `smoke/invite.spec.ts` |
| Email queue (mocked Resend) | Covered | `email/email-queue.spec.ts` (no UI) |
| First-admin `/setup` | None | Dev-only unlock exists; not e2e’d |
| Users invite UI (`/dashboard/users/access`) | None | Invite created via helper, not Users UI |
| Full crew `/onboarding` completion | Covered | `crew/crew-onboarding-complete.spec.ts` (Batch 4) |
| Full band `/onboarding/band` completion | Covered | `bands/band-onboarding-complete.spec.ts` (Batch 4) |

### Booking requests

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Public `/request` wizard submit | Covered | `booking/booking-submit.spec.ts` (Batch 3) |
| Staff convert → quote + tentative event | Covered | `booking/booking-convert.spec.ts` |
| Client track approve (`/request/track/[token]`) | Covered | `booking/booking-convert-approve.spec.ts` |
| Request list / detail browse | Partial | Asserted after convert/submit; no dedicated list UX test |

### Quotes and invoices

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Public quote page render | Covered | `smoke/public-quote.spec.ts` |
| Client approve / request changes | Covered | `quotes/public-quote-flows.spec.ts` |
| Client submit payment proof | Covered | `quotes/public-quote-flows.spec.ts` |
| Staff draft create → public link | Covered | `quotes/invoice-finalize.spec.ts` (Batch 3; no separate Finalize UI — draft + `/event/{token}`) |
| Staff mark payment received | Covered | `quotes/payment-proof-verify.spec.ts` (Batch 3) |
| PDF download / void | None | Deferred |
| Host orgs / managers | None | Deferred |

### Events and schedule

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Create Crewed Event + quick-add schedule | Covered | `smoke/event-create.spec.ts` |
| Dry Rental create + Delivery/Return quick-add | Covered | `events/event-edit-dry-hire.spec.ts` |
| Event title edit persist | Covered | `events/event-edit-dry-hire.spec.ts` |
| Crew availability Yes + admin assign | Covered | `crew/crew-availability-assign.spec.ts` |
| Venue create + pick on event | Covered | `events/venue-create-pick.spec.ts` (Batch 3) |
| Event series create/generate | Covered | `events/event-series-smoke.spec.ts` (Batch 5) |
| Crew scheduling board | Covered | `crew/crew-scheduling-board.spec.ts` (Batch 5) |
| Open Mic public + runner | None | Deferred |
| FullCalendar drag/resize | Deferred | Flaky; keep unit/manual |

### Inventory and rentals

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Dry-hire Process delivery + return (typed scans) | Covered | `inventory/rental-fulfillment.spec.ts` |
| Damage triage (open → in progress → resolved) | Covered | `inventory/damage-triage.spec.ts` |
| Damage report create | Covered | `inventory/damage-create.spec.ts` (Batch 5) |
| Pull-list edit UI | Covered | `inventory/pull-list-edit.spec.ts` (Batch 5) |
| Inventory catalog CRUD (types/items/packages) | None | Deferred |
| Lost-and-found `/e/[assetId]` | None | Deferred |

### Crew hiring

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Public `/crew/apply` → admin list | Covered | `crew/crew-application.spec.ts` |
| Admin trainee / convert / turn away | Covered | `crew/crew-application-triage.spec.ts` (Batch 4) |

### Bands and payouts

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Payee e-sign → mark paid | Partial | `bands/band-payment-esign.spec.ts` — mark-paid via helper, not payouts queue UI |
| Public `/artists/apply` → admin approve | Covered | `bands/band-application.spec.ts` (Batch 3) |
| Band payouts admin queue UI | Deferred | Known CI flakiness (Batch 6 stretch) |
| Band portal beyond e-sign | Partial | Onboarding covered (Batch 4); settings/payouts still deferred |

### Marketing and public site

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Design board / poster publish | Deferred | Immich / Instagram deps |
| Short links CRUD | Deferred | — |
| Work/stories publish | Deferred | — |
| Public directories (`/crew`, `/artists`, `/events`) | None | Low risk |

### Other

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Timecards | None | Deferred |
| Immich media albums | Deferred | External service |
| R2 upload happy path | Deferred | Needs R2 in CI |

---

## Spec index (current)

| File | Role |
|------|------|
| `global.setup.ts` / `crew.setup.ts` / `band.setup.ts` | Auth storage state |
| `smoke/auth.spec.ts` | Admin dashboard |
| `smoke/invite.spec.ts` | Invite accept |
| `smoke/event-create.spec.ts` | Crewed event + schedule |
| `smoke/public-quote.spec.ts` | Quote page render |
| `quotes/public-quote-flows.spec.ts` | Approve / changes / payment proof |
| `booking/booking-convert.spec.ts` | Staff convert |
| `booking/booking-convert-approve.spec.ts` | Track approve |
| `events/event-edit-dry-hire.spec.ts` | Edit + dry hire schedule |
| `crew/crew-availability-assign.spec.ts` | Availability + assign |
| `crew/crew-application.spec.ts` | Crew apply + admin list |
| `inventory/rental-fulfillment.spec.ts` | Delivery + return |
| `inventory/damage-triage.spec.ts` | Damage triage |
| `bands/band-payment-esign.spec.ts` | Band e-sign + helper mark paid |
| `bands/band-application.spec.ts` | Band apply + admin approve (Batch 3) |
| `booking/booking-submit.spec.ts` | Public `/request` wizard submit (Batch 3) |
| `quotes/invoice-finalize.spec.ts` | Staff invoice create → public link (Batch 3) |
| `quotes/payment-proof-verify.spec.ts` | Staff mark payment received (Batch 3) |
| `events/venue-create-pick.spec.ts` | Venue create + pick on event (Batch 3) |
| `crew/crew-application-triage.spec.ts` | Turn away / convert / trainee assign (Batch 4) |
| `crew/crew-onboarding-complete.spec.ts` | Crew onboarding wizard end-to-end (Batch 4) |
| `bands/band-onboarding-complete.spec.ts` | Band onboarding wizard end-to-end (Batch 4) |
| `inventory/pull-list-edit.spec.ts` | Pull-list qty edit + add type (Batch 5) |
| `inventory/damage-create.spec.ts` | Damage report create from queue (Batch 5) |
| `crew/crew-scheduling-board.spec.ts` | Scheduling board range/filter + assign link (Batch 5) |
| `events/event-series-smoke.spec.ts` | Recurring series create + overview (Batch 5) |
| `email/email-queue.spec.ts` | Mocked email pipeline |

## Planned batches 6

Subagent-ready brief. Follow Batch 1–5 patterns: seed with `e2eHelpers` (gate `assertE2eHelpersEnabled`), drive UI with Playwright, assert via `pollConvex`. Keep `E2E_EMAIL_MOCK`. Do **not** touch Immich/Instagram. Update this file when each batch lands.

Shared conventions:
- Specs under `apps/web/e2e/<domain>/`
- Helpers in `packages/backend/convex/e2eHelpers.ts`
- Dual-context public+admin: mirror [`crew-application.spec.ts`](../apps/web/e2e/crew/crew-application.spec.ts)
- Local: `E2E_SKIP_BOOT=1 pnpm test:e2e` against running stack; CI uses anonymous Convex


### Batch 6 — Secondary surfaces

**Theme:** Lower-risk shipped surfaces; still no external media deps.

| # | Spec file | Flow | Helpers to add | Assert |
|---|-----------|------|----------------|--------|
| 1 | `timecards/timecard-submit.spec.ts` | Crew submits `/dashboard/timecards/mine` entry; admin sees `/dashboard/timecards` | `ensureCrewUser`, `getTimecardState` | Row exists with expected hours/status |
| 2 | `marketing/short-link-crud.spec.ts` | Admin `/dashboard/marketing/links` create slug → list shows it → delete/expire | `getShortLinkBySlug` | Convex row + UI list; skip Worker HTTP redirect in CI unless easy |
| 3 | `inventory/lost-found-public.spec.ts` | Seed inventory item with `assetId` → public `/e/{assetId}` renders | Extend inventory seed from rental helpers | Page shows asset identity / lost-found copy |
| 4 | `smoke/public-directories.spec.ts` | `/crew`, `/artists`, `/events` return 200 and a heading | Optional seed public profiles | No crash; key heading visible |
| 5 | `bands/band-payouts-queue.spec.ts` *(stretch)* | Admin `/dashboard/financial-hub/band-payouts` send signature request (if UI stable) | Reuse `seedBandPaymentForEsign` | Email queued / status awaiting_confirmation — **skip or quarantine if CI-flaky** |

**Still deferred after Batch 6:** Marketing design board / Instagram publish, Immich uploads, R2 upload happy path, Open Mic runner (promote only if product priority).

---

## How to update this doc

When adding or changing e2e coverage:

1. Add/adjust the row in **Coverage by section** (`Covered` / `Partial` / `None` / `Deferred`).
2. Add the spec to **Spec index**.
3. Bump **Last updated** and, if shipping a batch, add a **Batch history** row.
4. Keep deferred items honest — if a flow becomes green in CI, promote it out of Deferred.
5. When a planned batch ships, move its rows from **Planned batches** into history and coverage tables.

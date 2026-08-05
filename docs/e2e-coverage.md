# Playwright e2e coverage

Living map of what the Playwright suite covers vs shipped app surfaces.
Update this file whenever specs or helpers land (or when a batch ships).

- Specs: [`apps/web/e2e/`](../apps/web/e2e/)
- Seeds/asserts: [`packages/backend/convex/e2eHelpers.ts`](../packages/backend/convex/e2eHelpers.ts)
- Runner: `pnpm test:e2e` ([`scripts/e2e-run.mjs`](../scripts/e2e-run.mjs))
- CI: [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml)

**Local vs cloud:** `pnpm test:e2e` boots **anonymous** Convex into
`packages/backend/.env.local` (Convex cannot provision via an empty
`--env-file`). Locally it stashes any prior cloud `.env.local` as
`.env.local.pre-e2e` and restores it on exit; it also mirrors the anonymous
config to `.env.e2e.local`. That keeps purge/seed/email-helper I/O off the team
plan. Opt into shared cloud Dev with `E2E_USE_CLOUD_DEV=1` or
`CONVEX_AGENT_MODE=cloud`. `E2E_SKIP_BOOT=1` reuses a running stack and warns if
the URL looks like cloud.

**Last updated:** 2026-07-31 (Batches 1–12 on `main`, Batches 13–14 on `t3code/next-e2e-tests`)

## Batch history

| Batch | PR | What landed |
|-------|-----|-------------|
| **1** | [#54](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/54) | Auth, invite accept, event create/schedule, public quote smoke + approve/changes/payment-proof submit, crew availability→assign, email queue, booking track-approve |
| **2** | [#56](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/56) | Staff booking convert, dry-hire delivery+return scans, damage triage, band e-sign→mark paid (helper), public crew apply→admin list |
| **3** | [#61](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/61) | Public booking submit, staff invoice create→public link, staff payment-proof verify, band apply+approve, venue create+pick |
| **4** | [#62](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/62) | Crew application triage (turn away / convert / trainee assign), crew `/onboarding` completion, band `/onboarding/band` completion |
| **5** | [#62](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/62) | Pull-list edit (qty + add type), damage report create, crew scheduling board, event series create |
| **6** | [#62](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/62) | Timecard read path, short-link create/delete, public lost-and-found, public directories, band payouts queue |
| **7** | [#64](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/64) | Authorization boundaries: admin route guards, Convex-level enforcement, org-type separation, plus an `AdminOnlyGuard` so refusals read as refusals |
| — | [#65](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/65) | Not a batch: the ascending-`take` fix shipped five `*-list-recency` specs plus `marketing/work-posts-admin.spec.ts` |
| **8** | [#71](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/71) | Money paths: invoice line items + totals, discounts, send-for-review round trip, approval-token rotation, approval reset + duplicate, host orgs/contacts, payment-proof invalidate + receipt |
| **9** | [#76](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/76) | Users, access, and rates: invite lifecycle, direct create, the role grant that flips a Batch 7 refusal, remove/reactivate access, org memberships, per-user crew rates. Found two shipped bugs: the Edit Invitation role picker could not be changed at all, and three Users sub-routes had no `AdminOnlyGuard` so they refused by crashing |
| **10** | on branch | Inventory catalog: model type CRUD + derived rates, categories/capabilities, public listing vs full profile, package build/edit/delete, package publishing, items + storage locations with containment and location cascade. Found two shipped bugs: the types manager's search filtered only the page already loaded, and a package could not be listed publicly without a section yet Create silently did nothing |
| **11** | — | Event series editors: "this occurrence only" scope does not affect sibling occurrences — pins the applyScope reset guard [#75](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/75) |
| **12** | — | Band org profile admin birdseye edit; inventory CSV import (types + assets from fixture files) |
| **13** | on branch | Booking request lifecycle: inbox status filters (open view hides completed), staff actions (assignee, staff notes, mark in review), decline guards (client + server) + the declined client portal, the converted-request lock (UI + backend `updateStatus` refusal), round-robin settings, admin cascade delete. Replaced `booking-decline-reason.spec.ts` with a superset spec. Also: `pruneE2eSeedData` now prunes stale converted/declined requests, and a new run-start `pruneStaleE2eUsers` removes invite-created accounts — see “Keeping the shared deployment usable” |
| **14** | on branch | Money long tail: fee definitions and terms templates — the two settings cards on `/dashboard/financial-hub` that feed the invoice editor and the public quote. The fee spec drives CRUD (add/edit default amount/disable/enable/delete) and then the editor: a definition pre-fills the fee-row rate from `defaultAmountUsd` and the persisted line carries `feeDefinitionId`. The terms spec drives CRUD and then attaches a template to a draft invoice, asserting `termsIds` persisted *and* the public quote page renders the combined markdown. (The invoice managers roster spec shipped with this batch was removed — the roster page it covered was deleted as part of the sidebar cleanup that also removed the Managers nav entry.) |

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
| Users invite UI (`/dashboard/users/access`) | Covered | `users/user-invite-lifecycle.spec.ts` (Batch 9) — invite → edit role → resend → cancel, plus the declined confirm |
| Direct user create (`createUserAdmin`) | Covered | `users/user-create-and-promote.spec.ts` (Batch 9) |
| Role grant flips an admin refusal | Covered | `users/user-create-and-promote.spec.ts` (Batch 9) — member refused → promoted → same session admitted → demoted → refused again |
| Remove access / reactivate | Covered | `users/user-access-remove-reactivate.spec.ts` (Batch 9) — asserts the `banned` flag as well as the table filter |
| Admin cannot remove their own access | Covered | `users/user-access-remove-reactivate.spec.ts` (Batch 9) — driven as a second, throwaway admin |
| Org memberships add / remove | Covered | `users/user-membership-edit.spec.ts` (Batch 9) — includes the default-org removal refusal |
| Non-admin refused on Users sub-routes | Covered | `users/user-create-and-promote.spec.ts` (Batch 9) — `/users/access`, `/users/organizations`, `/users/crew-rates` |
| Full crew `/onboarding` completion | Covered | `crew/crew-onboarding-complete.spec.ts` (Batch 4) |
| Full band `/onboarding/band` completion | Covered | `bands/band-onboarding-complete.spec.ts` (Batch 4) |
| Non-admin refused on admin routes | Covered | `auth/admin-route-guards.spec.ts` (Batch 7) |
| Convex refuses privileged calls from a crew token | Covered | `auth/backend-enforcement.spec.ts` (Batch 7) — bypasses the UI entirely |
| Org-type separation (Arbor-only / band-only) | Covered | `auth/org-context-guards.spec.ts` (Batch 7) |

### Booking requests

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Public `/request` wizard submit | Covered | `booking/booking-submit.spec.ts` (Batch 3) |
| Staff convert → quote + tentative event | Covered | `booking/booking-convert.spec.ts` |
| Client track approve (`/request/track/[token]`) | Covered | `booking/booking-convert-approve.spec.ts` |
| Request inbox / status filters | Covered | `booking/request-inbox.spec.ts` (Batch 13) — default open view lists submitted + in-review and hides completed; "Declined" and "All statuses" filters |
| Request detail browse | Covered | `booking/request-convert-lock.spec.ts` (Batch 13) — converted row renders the "Open tentative event" link |
| Assignee, staff notes, mark in review | Covered | `booking/request-staff-actions.spec.ts` (Batch 13) — assignee recorded on the row; submitted → in_review persists notes + `reviewedAt`, and "Mark in review" leaves |
| Decline reason + declined portal | Covered | `booking/request-decline-guard.spec.ts` (Batch 13) — the no-reason refusals (client-side form and server-side `updateStatus`), then a real decline; staff actions panel leaves; the client track link shows "Status: Declined" |
| Converted-request lock | Covered | `booking/request-convert-lock.spec.ts` (Batch 13) — staff actions panel hidden; `eventRequests:updateStatus` refuses ("Converted requests cannot be updated") |
| Round-robin assignee settings | Covered | `booking/round-robin-settings.spec.ts` (Batch 13) — add/remove a rotation member via the settings UI, asserted through the settings row; restores the empty default in `afterEach` |
| Cascade delete of a request | Covered | `booking/request-cascade-delete.spec.ts` (Batch 13) — dialog previews the linked quote + event, "Delete all" removes them with the request |

### Quotes and invoices

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Public quote page render | Covered | `smoke/public-quote.spec.ts` |
| Client approve / request changes | Covered | `quotes/public-quote-flows.spec.ts` |
| Client submit payment proof | Covered | `quotes/public-quote-flows.spec.ts` |
| Staff draft create → public link | Covered | `quotes/invoice-finalize.spec.ts` (Batch 3; no separate Finalize UI — draft + `/event/{token}`) |
| Staff mark payment received | Covered | `quotes/payment-proof-verify.spec.ts` (Batch 3) |
| Line item add / edit / remove + totals | Covered | `quotes/invoice-line-items.spec.ts` (Batch 8) — asserts the browser's `computeInvoiceDraftTotals` and the server's `computeTotals` agree |
| Discount amount / percent + clamp + warning | Covered | `quotes/invoice-discount.spec.ts` (Batch 8) |
| Send quote to client → withdraw → re-send | Covered | `quotes/invoice-send-for-review.spec.ts` (Batch 8) — request-linked quotes only |
| Approval token regeneration | Covered | `quotes/invoice-token-regeneration.spec.ts` (Batch 8) — asserts the old link dies, and that dismissing the confirm changes nothing |
| Editing an approved quote resets approval | Covered | `quotes/invoice-reset-and-duplicate.spec.ts` (Batch 8) |
| Duplicate invoice | Covered | `quotes/invoice-reset-and-duplicate.spec.ts` (Batch 8) — new number + token, no inherited approval |
| Staff invalidate payment proof / attach receipt | Covered | `quotes/payment-proof-manage.spec.ts` (Batch 8) |
| Host orgs + client contacts | Covered | `quotes/invoice-organizations.spec.ts` (Batch 8) — create → bill an invoice → archive; merge duplicate hosts |
| Invoice managers roster (`/financial-hub/managers`) | Covered | `quotes/invoice-managers.spec.ts` (Batch 14) — edit title/phone on a row persists via `updateUserAdmin`; restores the shared admin row in `afterAll` |
| Fee definitions | Covered | `quotes/invoice-fee-definitions.spec.ts` (Batch 14) — add/edit default amount/disable/enable/delete on the settings card, plus the editor link: picking a definition pre-fills the fee-row rate and the persisted line carries `feeDefinitionId` |
| Terms templates | Covered | `quotes/invoice-terms-templates.spec.ts` (Batch 14) — add/edit markdown/disable/enable/delete on the settings card, plus the editor link: a checked template lands on `termsIds` and renders on the public quote page |
| PDF download / void | None | Deferred |
| Per-user crew rates (`/users/crew-rates`) | Covered | `users/user-rates-admin.spec.ts` (Batch 9) — custom rate, then a pinned mode resolving to the global rate; reads the globals, never writes them |
| Invoice settings (global crew rates) | Deferred | `invoiceSettings.update` writes **global** crew rates. On the shared deployment that silently re-prices every other worktree's crew lines, so it is not safe to drive from a spec |

### Events and schedule

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Create Crewed Event + quick-add schedule | Covered | `smoke/event-create.spec.ts` |
| Dry Rental create + Delivery/Return quick-add | Covered | `events/event-edit-dry-hire.spec.ts` |
| Event title edit persist | Covered | `events/event-edit-dry-hire.spec.ts` |
| Crew availability Yes + admin assign | Covered | `crew/crew-availability-assign.spec.ts` |
| Venue create + pick on event | Covered | `events/venue-create-pick.spec.ts` (Batch 3) |
| Event series create/generate | Covered | `events/event-series-smoke.spec.ts` (Batch 5) |
| Event series editors ("this occurrence" scope) | Covered | `events/event-series-edit-scope.spec.ts` (Batch 11 — pins the applyScope reset guard) |
| Crew scheduling board | Covered | `crew/crew-scheduling-board.spec.ts` (Batch 5) |
| Open Mic public + runner | None | Deferred on product priority, not on difficulty — 575 lines and three routes, the largest untested module left. See the batch candidates |
| FullCalendar drag/resize | Deferred | Flaky; keep unit/manual |

### Inventory and rentals

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Dry-hire Process delivery + return (typed scans) | Covered | `inventory/rental-fulfillment.spec.ts` |
| Damage triage (open → in progress → resolved) | Covered | `inventory/damage-triage.spec.ts` |
| Damage report create | Covered | `inventory/damage-create.spec.ts` (Batch 5) |
| Pull-list edit UI | Covered | `inventory/pull-list-edit.spec.ts` (Batch 5) |
| Model type create / edit / delete | Covered | `inventory/type-crud.spec.ts` (Batch 10) — asserts the rates the server *derives* (5%/10% of MSRP) and the legacy `rentalPriceUsd` mirror, not just the field that was typed |
| Type delete guards | Covered | `inventory/type-crud.spec.ts` (Batch 10) — refused while an item links the type |
| Categories + capability keys | Covered | `inventory/type-taxonomy.spec.ts` (Batch 10) — seed defaults, create both, use them on a type, the in-use category refusal |
| Type public listing / full profile | Covered | `inventory/type-public-visibility.spec.ts` (Batch 10) — asserts a listing-only type does **not** leak tips/slug, plus the bulk visibility bar |
| Public `/types` and `/types/[bucket]` | Covered | `inventory/type-public-visibility.spec.ts` (Batch 10) — render smoke + unknown-bucket redirect; see the ISR note below |
| Package create / edit / delete | Covered | `inventory/package-crud.spec.ts` (Batch 10) — catalog panel, quantities, suggested pricing, the discard confirm |
| Package public listing | Covered | `inventory/package-public-listing.spec.ts` (Batch 10) — section required, bucket mapping, archiving drops it from the public query |
| Inventory item create / containment | Covered | `inventory/item-storage-crud.spec.ts` (Batch 10) — duplicate asset ID refused, container location inheritance |
| Storage locations | Covered | `inventory/item-storage-crud.spec.ts` (Batch 10) — nested path composition and both delete guards |
| Lost-and-found `/e/[assetId]` | Covered | `inventory/lost-found-public.spec.ts` (Batch 6) |
| Inventory CSV import | Covered | `inventory/csv-import.spec.ts` (Batch 12) — uploads types + assets from fixture files, asserts via `getInventoryTypeByName` / `getInventoryItemByAssetId` |
| Type icon / promo / manual uploads | Deferred | Needs R2 in CI |

### Crew hiring

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Public `/crew/apply` → admin list | Covered | `crew/crew-application.spec.ts` |
| Admin trainee / convert / turn away | Covered | `crew/crew-application-triage.spec.ts` (Batch 4) |

### Bands and payouts

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Payee e-sign → mark paid | Covered | `bands/band-payment-esign.spec.ts` (e-sign) + `bands/band-payouts-queue.spec.ts` (mark paid via queue UI) |
| Band shows home + assignment | Covered | `bands/band-shows-home.spec.ts` — `/dashboard` Your shows, upcoming chip, e-sign from recent card, staff Assign band → `band_assigned` email |
| Public `/artists/apply` → admin approve | Covered | `bands/band-application.spec.ts` (Batch 3) |
| Band payouts admin queue UI | Covered | `bands/band-payouts-queue.spec.ts` — send signature request + mark paid |
| Band portal beyond e-sign | Partial | Onboarding (Batch 4) + shows home; payee settings still light |
| Band org profile admin birdseye (`/users/organizations`) | Covered | `users/band-org-profile.spec.ts` (Batch 12) — admin edits the display name, asserts via `getBandOrganizationProfileByDisplayName` |

### Marketing and public site

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Design board / poster publish | Deferred | Immich / Instagram deps |
| Short links CRUD | Covered | `marketing/short-link-crud.spec.ts` (Batch 6); Worker redirect still out of suite |
| Work/stories publish | Deferred | — |
| Public directories (`/crew`, `/artists`, `/events`) | Covered | `smoke/public-directories.spec.ts` (Batch 6) |

### Other

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Timecards | Covered | `timecards/timecard-view.spec.ts` (Batch 6) — read-only; app has no submit mutation |
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
| `bands/band-shows-home.spec.ts` | Band Your shows home, assign → email, e-sign from card |
| `bands/band-application.spec.ts` | Band apply + admin approve (Batch 3) |
| `booking/booking-submit.spec.ts` | Public `/request` wizard submit (Batch 3) |
| `booking/request-inbox.spec.ts` | Inbox list UX: open view, status filter, all statuses (Batch 13) |
| `booking/request-staff-actions.spec.ts` | Assignee + staff notes + mark in review (Batch 13) |
| `booking/request-decline-guard.spec.ts` | Decline guards (client + server), terminal state, client portal mirror (Batch 13) |
| `booking/request-convert-lock.spec.ts` | Converted request hides staff actions; backend refuses `updateStatus` (Batch 13) |
| `booking/round-robin-settings.spec.ts` | Round-robin assignee rotation add/remove (Batch 13) |
| `booking/request-cascade-delete.spec.ts` | Admin cascade delete preview + confirm (Batch 13) |
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
| `events/event-series-edit-scope.spec.ts` | Series scope isolation: "this occurrence" edit doesn't modify siblings (Batch 11) |
| `timecards/timecard-view.spec.ts` | Crew + admin timecard read path (Batch 6) |
| `marketing/short-link-crud.spec.ts` | Short link create → delete (Batch 6) |
| `inventory/lost-found-public.spec.ts` | Public `/e/{assetId}` found + not-found (Batch 6) |
| `smoke/public-directories.spec.ts` | `/crew`, `/artists`, `/events` render (Batch 6) |
| `bands/band-payouts-queue.spec.ts` | Send signature request + mark paid from the queue (Batch 6) |
| `auth/admin-route-guards.spec.ts` | Non-admin refused on the 9 sidebar `adminOnly` routes (Batch 7) |
| `auth/backend-enforcement.spec.ts` | Convex refuses privileged query/mutation from a crew JWT (Batch 7) |
| `auth/org-context-guards.spec.ts` | Arbor-only vs band-only route separation (Batch 7) |
| `bands/band-application-list-recency.spec.ts` | Newest band application is listed (#65) |
| `crew/crew-application-list-recency.spec.ts` | Newest crew application is listed (#65) |
| `inventory/damage-queue-recency.spec.ts` | Newest damage report is listed (#65) |
| `marketing/short-link-list-recency.spec.ts` | Newest short link is listed (#65) |
| `quotes/invoice-list-recency.spec.ts` | Newest invoice is listed (#65) |
| `marketing/work-posts-admin.spec.ts` | Work post admin editor (#65) |
| `quotes/invoice-line-items.spec.ts` | Line items across sections + totals (Batch 8) |
| `quotes/invoice-managers.spec.ts` | Invoice managers roster title/phone edit (Batch 14) |
| `quotes/invoice-fee-definitions.spec.ts` | Fee definition CRUD + editor fee-picker link (Batch 14) |
| `quotes/invoice-terms-templates.spec.ts` | Terms template CRUD + attach to invoice + public page (Batch 14) |
| `quotes/invoice-discount.spec.ts` | Discount math, zero clamp, warning (Batch 8) |
| `quotes/invoice-send-for-review.spec.ts` | Send sheet → withdraw → re-send + emails (Batch 8) |
| `quotes/invoice-token-regeneration.spec.ts` | Approval token rotation revokes the old link (Batch 8) |
| `quotes/invoice-reset-and-duplicate.spec.ts` | Approval reset on edit; duplicate (Batch 8) |
| `quotes/invoice-organizations.spec.ts` | Host org + contact → invoice → archive; merge duplicates (Batch 8) |
| `quotes/payment-proof-manage.spec.ts` | Invalidate submission; attach receipt (Batch 8) |
| `users/user-invite-lifecycle.spec.ts` | Invite → edit → resend → cancel (Batch 9) |
| `users/user-create-and-promote.spec.ts` | Create user; role grant flips the admin refusal (Batch 9) |
| `users/user-access-remove-reactivate.spec.ts` | Remove access / reactivate; self-lockout guard (Batch 9) |
| `users/user-membership-edit.spec.ts` | Add/remove an org membership from row details (Batch 9) |
| `users/user-rates-admin.spec.ts` | Per-user rate mode + resolved rate (Batch 9) |
| `inventory/type-crud.spec.ts` | Type create/edit/delete + derived rates + delete guard (Batch 10) |
| `inventory/type-taxonomy.spec.ts` | Categories and capability keys, and the in-use refusal (Batch 10) |
| `inventory/type-public-visibility.spec.ts` | Listing vs full profile, bulk visibility, public pages (Batch 10) |
| `inventory/package-crud.spec.ts` | Package build from the catalog, edit, discard confirm, delete (Batch 10) |
| `inventory/package-public-listing.spec.ts` | Section required, bucket mapping, archive (Batch 10) |
| `inventory/item-storage-crud.spec.ts` | Items, containment cascade, storage-location paths (Batch 10) |
| `email/email-queue.spec.ts` | Mocked email pipeline |
| `inventory/csv-import.spec.ts` | CSV import: types + assets from fixture files (Batch 12) |
| `users/band-org-profile.spec.ts` | Band org profile admin edit + pollConvex assert (Batch 12) |

## Remaining gaps

Batches 1–13 cover the shipped happy paths. What is still out of the suite splits
into two piles, and they are worth keeping apart — one is a scheduling question,
the other is not.

| Surface | Why it is out |
|---------|---------------|
**Blocked on something external** — these need a dependency the suite does not
have, so effort alone will not move them:

| Surface | Blocker |
|---------|---------|
| Marketing design board / Instagram publish | Immich + Instagram external deps |
| Immich media albums (`/dashboard/media`, event media tab) | External service |
| R2 upload happy path, inventory image/manual uploads, band org hero | `FileUploadField` needs R2 credentials in CI |
| Short-link Worker redirect | Lives in the Cloudflare Worker, not the Next app |
| FullCalendar drag/resize | Flaky; covered by unit/manual testing |
| Global invoice settings (crew rates) | Shared-deployment hazard — see the Quotes and invoices table |

**Just not batched yet** — sized below by the backend module behind each, since
that is the better risk proxy than the page count:

| Surface | Backend | What exists today |
|---------|---------|-------------------|
| Open Mic (`/events/open-mic`, `/[id]`, public page) | `openMic.ts` 575 | nothing but the Batch 7 route guard |
| Crew availability beyond one Yes (`/events/my-availability`) | `eventCrewAvailability.ts` 832 | one yes → assign path |
| Invoice PDF download / void | `invoicePdf.ts` | nothing |
| Account page, event expenses, event artifacts, marketing settings | 217 / 73 / 107 / 56 | nothing |
| Password reset from the Users row, onboarding waive | — | nothing; `sendPasswordResetAdmin` hands off to Better Auth's flow, and waive only makes sense against a half-finished onboarding |

(The booking request lifecycle row is gone — Batch 13 covered the inbox, staff actions, decline, the convert lock, round-robin settings, and cascade delete. "Reschedule" from the old batch description turned out not to be a shipped mutation; a client reschedules by requesting quote changes, which Batch 8 already covers. The money-long-tail row is gone too — Batch 14 covered fee definitions and terms templates, including their links into the invoice editor and public quote page. Its invoice managers roster spec was removed when the roster page was deleted in the sidebar cleanup.)

### Candidates for the next batches

Ordered by blast radius rather than by size — what breaks silently and costs the
most to discover late.

| Batch | Surface | Why it is next |
|-------|---------|----------------|
| **15?** | Open Mic | The largest wholly-untested module left (575 lines, three routes, a public page). Listed as low product priority since Batch 1 — worth confirming that is still true before spending a batch, because on size alone it would rank far higher |

Not worth a batch on their own: the account page, event expenses, event
artifacts and marketing settings are 450 lines between them. Fold them into
whichever batch is already touching that area rather than scheduling them.

### Keeping the shared deployment usable

Seeded events all land on the same `startAt`, and several product queries page
with `.take(150)`/`.take(200)`. Once runs accumulate past those caps the newest
seeded row sorts out of range and specs fail for reasons unrelated to the code
under test — this broke `crew-availability-assign` outright at ~265 events.

Run `convex run e2eHelpers:pruneE2eSeedData '{"dryRun":true}'` to check, then
drop `dryRun` to clear `E2E `-prefixed events older than two hours along with
their child rows. Batch with `limit` to stay inside mutation limits. Since Batch
13 the same mutation also prunes stale **converted/declined** booking requests:
the event pass leaves the request and its draft invoice orphaned, and
`eventRequests.list` pages with `.take(100)`, so the inbox can overflow the same
way the event caps do. Requests that are still open (submitted / in_review) are
never pruned — a spec that seeds one must clean it up itself
(`e2eHelpers:deleteBookingRequestFixture`, which Batch 13's specs all call in
`afterAll`).

The pruner also leaves **users** behind: every run of `smoke/invite.spec.ts`
accepts a fresh one-time invite and creates a real Better Auth account, and
those were never deleted. They don't page under any `.take()` cap, but they
break name-keyed pickers: the comment mention typeahead resolves `@Name` to
*every* candidate with that name (`extractMentionedUserIds`), so two dozen
accumulated "E2E Crew" members turn one mention into a "You can mention at most
20 people" refusal. `scripts/e2e-run.mjs` now runs
`e2eHelpers:pruneStaleE2eUsers` at boot, deleting stamped accounts
(`e2e.crew.<ts>@arborlive.test`, `e2e.crew.apply.<ts>@stanford.edu` — anything
matching `e2e.<…>.<digits>@`) with their Better Auth rows and per-user app rows.
The stable per-purpose accounts contain no timestamp and are never touched.
Run it manually with `convex run e2eHelpers:pruneStaleE2eUsers '{"dryRun":true}'`.

Batch 9's fixtures are instead **stable
per-purpose accounts** (`e2e-access-target@`, `e2e-promote-target@`,
`e2e-rates-target@`, `e2e-membership-target@`, `e2e-guard-admin@`) that each run
re-seeds in place, so nothing accumulates — and where a stamped identity is
unavoidable, the spec cleans up after itself
(`e2eHelpers:deleteInvitationsByEmail`, since invitations are read with
`.take(2000)` and `resendInviteAdmin` matches on email, not id). Any new batch
should pick one of those two shapes rather than leaving rows behind.

Batch 10 uses the second shape throughout: every catalog spec names the rows it
creates and hands them to `e2eHelpers:deleteInventoryCatalogFixtures` in an
`afterAll`, which deletes in dependency order (items → package lines and
packages → types → deepest locations first → categories → capabilities). It
deletes through `ctx.db` rather than the product mutations on purpose — the
product's own delete guards are what the specs assert, so cleanup must not
depend on behaviour a failing run may have left half-applied.

Batch 14 uses the same shape for the financial settings rows:
`e2eHelpers:deleteInvoiceSettingsFixtures` takes the fee-definition keys and
terms-template labels the specs created (plus any integration draft invoices)
and deletes them through `ctx.db` in dependency order — invoices first, since a
line item may carry `feeDefinitionId` and an invoice may carry `termsIds`. The
managers spec instead restores the shared admin row's title/phone to empty in
`afterAll` via `e2eHelpers:setUserAdminProfileFields`, so a failed run cannot
leave a fixture title on the account every worktree signs in as.

Run `convex run e2eHelpers:getInventoryCatalogCounts '{}'` to see where the
catalog sits against the caps that matter:

| Read | Cap | Fails as |
|------|-----|----------|
| `inventoryTypes.listOptions` | 1500 | the packages catalog panel and the item editor's Type picker cannot see a new type |
| `inventoryItems.listSummaries` | 1000 | the item editor's "Contained In Asset" picker cannot see a new asset |
| `inventoryPackages.list` | 500 | the packages page cannot see a new package |
| `inventoryItems.list` | 100/page unfiltered; 2000 scan when filtered | unfiltered Load more still needed for deep pages; filtered search is one finished page |

At the time of writing: 289 types, 387 items, 2 packages, 2 locations.

Conventions for any new batch:
- Specs under `apps/web/e2e/<domain>/`
- Helpers in `packages/backend/convex/e2eHelpers.ts`, gated by `assertE2eHelpersEnabled`
- Seed with `e2eHelpers`, drive the UI with Playwright, assert via `pollConvex`
- Scope locators to the row you seeded — the shared deployment accumulates fixtures
- Find form fields with `e2e/helpers/form.ts` and dropdowns with
  `e2e/helpers/select.ts`; `getByLabel` does not work anywhere in this app (trap 5)
- Catalog specs share `e2e/helpers/inventory.ts` (typed state readers, row
  locators, `revealRow`, fixture cleanup)
- Assert public catalog state through `e2eHelpers:getPublicInventoryListing`,
  not the rendered page: `/types`, `/types/[bucket]`, `/packages` and
  `/packages/[bucket]` are statically generated with `revalidate = 3600` and
  only refresh early via an `/api/revalidate` call that needs
  `REVALIDATE_SECRET`, which the e2e stack does not set. The pages get a render
  smoke; the query is the contract
- Local: `pnpm test:e2e` boots anonymous Convex (stashes/restores cloud
  `.env.local`). `E2E_SKIP_BOOT=1 pnpm test:e2e` reuses a running stack
  (prefer anonymous; cloud Dev burns plan Database I/O). CI always uses
  anonymous Convex.

### Bugs the suite has caught

Worth recording, because each one argues for the next batch.

| Batch | Bug | Mechanism |
|-------|-----|-----------|
| 10 | The types manager's **search box only searched the page already loaded** | None of `inventoryTypes.list`'s filters (substring search, capability membership, manufacturer/visibility equality) can be served by an index, so they ran in memory — against `result.page` from `paginate()`, not the table. With 289 types and `initialNumItems: 100`, typing the exact name of a type created seconds earlier returned "No types match the current filters" until the operator pressed Load more twice. Pagination is `_creationTime` ascending, so the rows this hid were always the newest — the same failure [#65](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/65) fixed elsewhere. Now: filtered reads scan a bounded window (`MAX_TYPE_OPTIONS`, 2000) and return one finished page; unfiltered reads still paginate |
| 10 | Listing a package publicly without a section made **Create do nothing at all** | The schema's `.refine()` puts the error on `publicBucket`, but the section picker is a plain `<select>` rather than a `FormField`, so no `FormMessage` rendered it — `handleSubmit` just declined to call the mutation. Fixing the render was not enough: `useConvexForm` memoises what it returns on `[form, isDirty, saveStatus, …]`, so the `formState` snapshot it hands back never changes when a validation error appears, and this component's only other re-render trigger is `watch()`. The error line has to subscribe with `useFormState({ control })` |
| 9 | The Edit Invitation **role picker could not be changed** — every pick snapped back to the invite's current role | `useConvexForm` returns a *new object* whenever `isDirty` flips (deliberately, to wake save bars). `EditInviteModal`'s reset effect had `form` in its deps with no `if (form.formState.isDirty) return;` guard, so the first edit re-ran the effect and reset itself away. Eleven sibling components have the guard; this one did not |
| 9 | `/users/access`, `/users/organizations`, `/users/crew-rates` refused non-admins **by crashing** | They had `ArborOnlyGuard` but no `AdminOnlyGuard`, so a crew member walked through the org check and then tripped `requireAdmin` inside Convex, landing on the generic error boundary. Batch 7 added `AdminOnlyGuard` only to the routes its own spec listed |
| — | Ascending `.take()` hid the newest row in six admin lists | See [#65](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/65) |

**Still unfixed, found by Batch 10:**

*(none — both Batch 10 leftovers below were fixed after the batch.)*

~~`inventoryItems.list` filter-after-paginate~~ — fixed: filtered reads scan a
bounded window, filter with light type lookups, then fully hydrate only the
matches (unfiltered still paginates).

~~`capabilityDefinitions.remove` unguarded delete~~ — fixed: refuses while any
inventory type still lists the capability key (same idea as
`inventoryCategories.remove`).

**Still unfixed, found by Batch 11:**

*(none.)*

**Still unfixed, found by Batch 12:**

*(none.)*

**Still unfixed, found by Batch 13:**

- After an admin cascade-deletes a request, the dialog's `previewRequestDeletion`
  query re-subscribes once with the already-deleted id and logs an uncaught
  "Request not found" on the deployment. Benign — the dialog closes and the
  page navigates to the inbox — but the query has no `null` guard. If request
  deletion ever surfaces its own error UI, tighten that query first.
- The mention typeahead resolves `@Name` to every candidate with that name, so
  duplicate display names silently turn one mention into many (up to the 20-cap
  refusal). Not a shipped bug today — pruning keeps the suite's data clean — but
  worth remembering when two teammates share a display name for real.

**Still unfixed, found by Batch 14:**

*(none.)*

**Fixed since, now tested:** the same unguarded reset effect in
`events/event-series-schedule-editor.tsx` and
`events/event-series-shift-editor.tsx` — which Batch 9 predicted would leave
their `applyScope` pickers stuck on "all" — was fixed by
[#75](https://github.com/Arbor-Live/Arbor-Live-Portal/pull/75), which added the
`if (form.formState.isDirty) return;` guard to both. Batch 11 pins the fix:
`events/event-series-edit-scope.spec.ts` saves with "this occurrence only" and
asserts sibling occurrences were not modified.

### Known local flakes

`events/event-edit-dry-hire.spec.ts` ("quick-add delivery/return") and
`quotes/invoice-finalize.spec.ts` each failed once in a 104-test local run and
passed on a targeted re-run. Both die waiting for an element that a click should
have produced instantly — `Add artist row` only appends to local state — so the
click landed before hydration. That is the dev-mode race
[`scripts/e2e-run.mjs`](../scripts/e2e-run.mjs) documents when it explains why CI
builds for production; CI's `retries: 2` absorbs it. Worth hardening if either
starts failing in CI.

### Traps this codebase sets for Playwright

These fail in ways that do not look like what they are. Items 1–4 cost real
debugging time in Batch 8, items 5–8 in Batch 9, items 9–13 in Batch 10.

1. **`window.confirm` guards mutations.** `regeneratePublicApprovalToken`,
   host/contact archive, and the re-approval prompt on saving an edited approved
   quote all sit behind a native confirm. Playwright **dismisses dialogs by
   default**, so the mutation silently never runs and the spec times out polling
   for a change that was never requested. Register `page.once("dialog", d =>
   d.accept())` before the click. Dismissing is worth asserting too — that is the
   "operator declined" path.
2. **`SearchableSelect` portals its menu.** It renders into `document.body` at
   `position: fixed`, computed as `trigger.bottom + 4` with no flip-up, and
   recomputes on every scroll event. Opening it while the trigger is below the
   fold puts the menu off-screen ("outside of the viewport"), and Playwright's
   own scroll-into-view retriggers the reposition so the "stable" actionability
   check never settles. Scroll the trigger to `block: "center"` first, then click
   the option with `force`, then assert the trigger's text changed — `force`
   skips the hit test, so a missed click otherwise leaves the menu open and every
   later click on the page inherits the instability. The hardened
   `pickSearchableOption` now lives in `e2e/helpers/select.ts` (Batch 10
   generalised it out of `e2e/quotes/invoice-organizations.spec.ts`, which keeps
   its own copy); the older `selectSearchableOption` in `e2e/helpers/auth.ts`
   does neither and only works on fields high enough on the page to dodge the
   problem. The portalled menu carries `data-testid="searchable-select-menu"`
   so the helper can address it and its search input structurally — several
   call sites use a "Filter by …" placeholder rather than "Search …".
3. **`SearchableSelect` also renders a `New <thing>: "<query>"` button** whenever
   the query is not an exact label match, and it is the *only* hit until the
   options query resolves. A loose name locator can settle on it and open the
   create modal instead of selecting anything. Match on something only the real
   option carries, like the contact's email.
4. **Saving from `/invoices/new` remounts the editor.** `router.replace` moves it
   into the `[id]` route, which re-hydrates every field from the saved invoice
   and reverts anything typed in that window — and the pass is not observable
   from the outgoing component. `createDraftInvoiceWithArtistLine` in
   `e2e/helpers/invoice.ts` absorbs this by loading the canonical URL once and
   waiting for hydration. Client-side navigations also fire no `load` event, so
   `page.waitForURL` can hang for its full timeout; poll `page.url()` instead.
5. **`getByLabel` reaches nothing in this app, and fails silently.**
   `FormControl` renders a plain `<div id={formItemId}>` around the input and
   `FormLabel` points `htmlFor` at that div, so every label is associated with a
   non-labelable element — `getByLabel("Email")` resolves to zero nodes. Because
   `actionTimeout` is unset (Playwright's default of 0, i.e. no timeout), the
   `fill()` then waits out the *entire* test timeout with no error, no
   screenshot, and no browser traffic: it reads as a hung app, not a bad
   selector. This burned five minutes per test in Batch 9's first run. Use
   `formField` / `selectByLabel` / `checkboxByLabel` from `e2e/helpers/form.ts`,
   which locate by `[data-slot='form-item']` instead.
6. **Radix `Select` is not `SearchableSelect`.** The shadcn `Select` in
   `@/components/ui/select` portals its listbox but locks page scroll while open,
   so it needs none of the centering/`force` handling above — `pickSelectOption`
   in `e2e/helpers/select.ts` is the right driver, and using the
   `SearchableSelect` recipe on it just adds flake. Two things still bite: the
   listbox unmounts on an animation, so clicking a second trigger too early
   lands on the dismiss layer instead (wait for the option to disappear), and the
   Users row's action menu pins `value=""` so its trigger text never changes —
   `chooseRowAction` exists for exactly that case.
7. **Row forms revert an edit made while a save is in flight.** Every
   `useConvexForm` row (Users table, `UserRateRow`, band org rows) calls
   `form.reset(values)` in `onSuccess`, and its Save button only renders while
   the form is dirty. Editing the same row again before that reset lands means
   the reset overwrites the second edit — the same shape as the invoice-editor
   remount, minus the navigation. Wait for the Save button to disappear before
   touching the row again (`saveRateRow` in `users/user-rates-admin.spec.ts`).
8. **Refusals also come through `window.alert`.** Removing a user's default-org
   membership and adding a duplicate membership both refuse client-side via
   `alert`, which Playwright dismisses silently — so a refused click and a broken
   click look identical. Capture the dialog and assert its message.
9. **A stale dev server on :3000 makes a new `data-testid` invisible.** Worktrees
   share one deployment *and* one port. If another checkout already owns :3000,
   `pnpm dev` here quietly takes :3001, the suite still points at :3000, and the
   failure is a testid "not found" on an element the screenshot plainly shows —
   which reads as a bad selector. Check with `lsof -ti:3000` and free the port
   rather than pointing `E2E_BASE_URL` somewhere else; the deployment those two
   servers share means the second one is not a safe target anyway.
10. **The catalog delete buttons swallow their own refusals.** `deleteType`,
    `removeItem` and `removeLocation` are all called as
    `onClick={() => void mutation({ id })}` with no catch, so a server refusal
    ("Cannot delete type with linked inventory items") produces an unhandled
    rejection and *no* UI change at all. There is nothing to assert on, so
    Batch 10 asserts the non-event instead: settle, then confirm the row is
    still there and the document still exists. If these ever grow an error
    path, tighten the assertion to the message.
11. **Two save affordances can carry the same label.** The types form renders an
    in-form `type="submit"` reading "Create" *and* a `FormSaveBar` whose
    `saveLabel` is also "Create", so `getByRole("button", { name: "Create" })`
    matches twice. Scope to `page.locator("form")` or to the bar
    (`role="status"`). Editing has no in-form submit at all — only the bar —
    and `persistType` does not reset after an edit, so the bar stays on screen
    after a *successful* save. Assert the save by polling Convex, never by
    waiting for the bar to go away.
12. **`hasText` is a substring, and the package editor has overlapping labels.**
    `formField(editor, "Subsidized Package Price (USD)")` also matches the
    "Non-Subsidized Package Price (USD)" item, and the ambiguity only surfaces
    as a strict-mode violation at the point of use. `formField` / `formTextarea`
    take a `RegExp` for exactly this (`/^Subsidized Package Price/`).
13. **The Next dev overlay renders server errors too.** Asserting a refusal with
    an unscoped `page.getByText("Asset ID already exists.")` is a strict-mode
    violation in dev: the message appears once in the `FormSaveBar` and again
    inside `#nextjs__container_errors_desc`, because the rejected mutation also
    reaches the error overlay. It passes in isolation and fails in a full run,
    depending on whether the overlay is already up. Scope refusal assertions to
    the bar (`formSaveBar(page)`), which is the stronger claim anyway — the
    operator has to see it in the form, not in a dev-only overlay.


## How to update this doc

When adding or changing e2e coverage:

1. Add/adjust the row in **Coverage by section** (`Covered` / `Partial` / `None` / `Deferred`).
2. Add the spec to **Spec index**.
3. Bump **Last updated** and, if shipping a batch, add a **Batch history** row.
4. Keep deferred items honest — if a flow becomes green in CI, promote it out of Deferred.
5. When a planned batch ships, move its rows from **Planned batches** into history and coverage tables.

# Playwright e2e coverage

Living map of what the Playwright suite covers vs shipped app surfaces.
Update this file whenever specs or helpers land (or when a batch ships).

- Specs: [`apps/web/e2e/`](../apps/web/e2e/)
- Seeds/asserts: [`packages/backend/convex/e2eHelpers.ts`](../packages/backend/convex/e2eHelpers.ts)
- Runner: `pnpm test:e2e` ([`scripts/e2e-run.mjs`](../scripts/e2e-run.mjs))
- CI: [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml)

**Last updated:** 2026-07-27 (Batches 1–8 on `main`; Batch 9 on branch)

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
| **9** | on branch | Users, access, and rates: invite lifecycle, direct user create, access remove/reactivate + last-admin guard, role grant flipping a Batch 7 refusal, per-user compensation, org memberships. Shipped two fixes the specs found: `AdminOnlyGuard` on the four `/dashboard/users` pages that had only `ArborOnlyGuard`, and a missing dirty guard that made the Edit Invitation modal unable to hold *any* edit |

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
| Users invite UI (`/dashboard/users/access`) | Covered | `users/user-invite-lifecycle.spec.ts` (Batch 9) — invite → edit → resend → cancel, incl. the rate/payroll payload the invite carries to acceptance |
| Create user directly (`createUserAdmin`) | Covered | `users/user-create-and-access.spec.ts` (Batch 9) |
| Remove / reactivate access | Covered | `users/user-create-and-access.spec.ts` (Batch 9) — asserts both `active` and Better Auth's `banned` |
| Admin cannot remove their own access | Covered | `users/user-create-and-access.spec.ts` (Batch 9) — restores access via helper in `afterAll`, so a regressed guard fails one test rather than the suite |
| Granting a role flips a refusal | Covered | `users/user-role-grant.spec.ts` (Batch 9) — promote → admitted → demote → refused, in a second signed-in context |
| Per-user compensation rates | Covered | `users/user-compensation-rates.spec.ts` (Batch 9) — custom, pinned-to-global, and the Users table agreeing with the Crew Rates page |
| Organizations + user memberships | Covered | `users/user-org-memberships.spec.ts` (Batch 9) — create org, add/remove membership, duplicate and default-org guards |
| Full crew `/onboarding` completion | Covered | `crew/crew-onboarding-complete.spec.ts` (Batch 4) |
| Full band `/onboarding/band` completion | Covered | `bands/band-onboarding-complete.spec.ts` (Batch 4) |
| Non-admin refused on admin routes | Covered | `auth/admin-route-guards.spec.ts` (Batch 7; four `/dashboard/users` pages added in Batch 9) |
| Convex refuses privileged calls from a crew token | Covered | `auth/backend-enforcement.spec.ts` (Batch 7) — bypasses the UI entirely |
| Org-type separation (Arbor-only / band-only) | Covered | `auth/org-context-guards.spec.ts` (Batch 7) |

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
| Line item add / edit / remove + totals | Covered | `quotes/invoice-line-items.spec.ts` (Batch 8) — asserts the browser's `computeInvoiceDraftTotals` and the server's `computeTotals` agree |
| Discount amount / percent + clamp + warning | Covered | `quotes/invoice-discount.spec.ts` (Batch 8) |
| Send quote to client → withdraw → re-send | Covered | `quotes/invoice-send-for-review.spec.ts` (Batch 8) — request-linked quotes only |
| Approval token regeneration | Covered | `quotes/invoice-token-regeneration.spec.ts` (Batch 8) — asserts the old link dies, and that dismissing the confirm changes nothing |
| Editing an approved quote resets approval | Covered | `quotes/invoice-reset-and-duplicate.spec.ts` (Batch 8) |
| Duplicate invoice | Covered | `quotes/invoice-reset-and-duplicate.spec.ts` (Batch 8) — new number + token, no inherited approval |
| Staff invalidate payment proof / attach receipt | Covered | `quotes/payment-proof-manage.spec.ts` (Batch 8) |
| Host orgs + client contacts | Covered | `quotes/invoice-organizations.spec.ts` (Batch 8) — create → bill an invoice → archive; merge duplicate hosts |
| PDF download / void | None | Deferred |
| Invoice managers (`/financial-hub/managers`) | None | — |
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
| Lost-and-found `/e/[assetId]` | Covered | `inventory/lost-found-public.spec.ts` (Batch 6) |

### Crew hiring

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Public `/crew/apply` → admin list | Covered | `crew/crew-application.spec.ts` |
| Admin trainee / convert / turn away | Covered | `crew/crew-application-triage.spec.ts` (Batch 4) |

### Bands and payouts

| Surface | Status | Spec / notes |
|---------|--------|--------------|
| Payee e-sign → mark paid | Covered | `bands/band-payment-esign.spec.ts` (e-sign) + `bands/band-payouts-queue.spec.ts` (mark paid via queue UI) |
| Public `/artists/apply` → admin approve | Covered | `bands/band-application.spec.ts` (Batch 3) |
| Band payouts admin queue UI | Covered | `bands/band-payouts-queue.spec.ts` — send signature request + mark paid |
| Band portal beyond e-sign | Partial | Onboarding covered (Batch 4); settings/payouts still deferred |

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
| `quotes/invoice-discount.spec.ts` | Discount math, zero clamp, warning (Batch 8) |
| `quotes/invoice-send-for-review.spec.ts` | Send sheet → withdraw → re-send + emails (Batch 8) |
| `quotes/invoice-token-regeneration.spec.ts` | Approval token rotation revokes the old link (Batch 8) |
| `quotes/invoice-reset-and-duplicate.spec.ts` | Approval reset on edit; duplicate (Batch 8) |
| `quotes/invoice-organizations.spec.ts` | Host org + contact → invoice → archive; merge duplicates (Batch 8) |
| `quotes/payment-proof-manage.spec.ts` | Invalidate submission; attach receipt (Batch 8) |
| `users/user-invite-lifecycle.spec.ts` | Invite → edit → resend → cancel (Batch 9) |
| `users/user-create-and-access.spec.ts` | Direct create; access remove/reactivate; last-admin guard (Batch 9) |
| `users/user-role-grant.spec.ts` | Role grant/revoke flips an admin refusal (Batch 9) |
| `users/user-compensation-rates.spec.ts` | Custom + pinned rates across both editors (Batch 9) |
| `users/user-org-memberships.spec.ts` | Org create; membership add/remove and its guards (Batch 9) |
| `email/email-queue.spec.ts` | Mocked email pipeline |

## Remaining gaps

Batches 1–8 cover the shipped happy paths. What is still out of the suite, and why:

| Surface | Why it is out |
|---------|---------------|
| Marketing design board / Instagram publish | Immich + Instagram external deps |
| Immich media albums | External service |
| R2 upload happy path | Needs R2 credentials in CI |
| Open Mic public + runner | Low product priority |
| Short-link Worker redirect | Lives in the Cloudflare Worker, not the Next app |
| FullCalendar drag/resize | Flaky; covered by unit/manual testing |
| Global invoice settings (crew rates) | Shared-deployment hazard — see the Quotes and invoices table |
| Inventory catalog CRUD, PDF download/void | Not yet batched |

### Candidates for the next batches

| Batch | Surface | Why |
|-------|---------|-----|
| **10** | Inventory catalog CRUD | ~3k lines across `types-manager` / `packages-manager` / `package-items-editor`, and every other spec seeds against this data model — the widest blast radius in the app, currently listed as low risk. Type visibility also drives the public `/types/[bucket]` pages, which have no coverage. Plan: name rows with the `E2E ` prefix and extend `pruneE2eSeedData` to clear catalog rows, the way seeded events are already kept in check |
| **11** | Invoice managers + PDF | `/financial-hub/managers` and PDF download/void are the last uncovered money surfaces |

### Keeping the shared deployment usable

Seeded events all land on the same `startAt`, and several product queries page
with `.take(150)`/`.take(200)`. Once runs accumulate past those caps the newest
seeded row sorts out of range and specs fail for reasons unrelated to the code
under test — this broke `crew-availability-assign` outright at ~265 events.

Run `convex run e2eHelpers:pruneE2eSeedData '{"dryRun":true}'` to check, then
drop `dryRun` to clear `E2E `-prefixed events older than two hours along with
their child rows. Batch with `limit` to stay inside mutation limits.

Conventions for any new batch:
- Specs under `apps/web/e2e/<domain>/`
- Helpers in `packages/backend/convex/e2eHelpers.ts`, gated by `assertE2eHelpersEnabled`
- Seed with `e2eHelpers`, drive the UI with Playwright, assert via `pollConvex`
- Scope locators to the row you seeded — the shared deployment accumulates fixtures
- Local: `E2E_SKIP_BOOT=1 pnpm test:e2e` against a running stack; CI uses anonymous Convex

### Traps this codebase sets for Playwright

These fail in ways that do not look like what they are. 1–4 and 9 cost real
debugging time in Batch 8; 5–8 came out of Batch 9.

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
   later click on the page inherits the instability. A hardened
   `pickSearchableOption` lives in `e2e/quotes/invoice-organizations.spec.ts`;
   the older `selectSearchableOption` in `e2e/helpers/auth.ts` does neither and
   only works on fields high enough on the page to dodge the problem.
3. **`SearchableSelect` also renders a `New <thing>: "<query>"` button** whenever
   the query is not an exact label match, and it is the *only* hit until the
   options query resolves. A loose name locator can settle on it and open the
   create modal instead of selecting anything. Match on something only the real
   option carries, like the contact's email.
4. **Radix `Select` options cannot reliably be clicked.** The Users pages are
   built almost entirely from them, and `selectOption` does not apply — the
   trigger is a button and the menu is portalled to `document.body`. Worse,
   Radix aligns the menu so the *checked* item sits over the trigger, so on a
   long list (the org pickers grow with every band org on the deployment) most
   options land outside the browser viewport, where Playwright refuses to click.
   `force` does not help — out-of-viewport is a hard error, not an actionability
   wait — and neither does scrolling, because the menu is positioned rather than
   scrolled. It first appeared as a bare three-minute test timeout with no
   failing assertion attached. `pickSelectOption` in `e2e/helpers/select.ts`
   drives the menu by keyboard instead — open, `Home`, then walk the highlight
   with `ArrowDown` until it reads the label, then Enter — so list length stops
   mattering. Pass `expectTriggerText: false` for the per-row Options menu, whose
   value is always `""` and never reflects the action taken.
   Three details in that helper are each load-bearing, and each cost a run:
   - **Do not use Radix's typeahead.** Radix treats Space as a *selection* key,
     so typing a label containing one ("Arbor Live") selects whatever is
     highlighted at the space, closes the menu, and lets the trailing Enter
     reopen it. You end up with a menu that is open, a value nobody chose, and a
     helper waiting on a close that already happened.
   - **Read open/closed from the trigger's `aria-expanded`,** not from
     `getByRole("listbox")`. These pages carry a listbox that is never the one
     you opened, so a global `toHaveCount(0)` never settles.
   - **Scope the highlighted item to `aria-controls`.** A page-wide
     `[data-highlighted]` lookup can latch onto the leftover highlight of a menu
     still animating out, so the walk reads one menu while Enter lands in
     another — the select silently keeps its old value.
5. **`FormLabel` labels a `<div>`, not the input.** `FormControl` is a wrapper
   div that takes `formItemId` rather than forwarding it to the control inside,
   so every `TextFormField` in the app is unlabelled as far as the accessibility
   tree — and therefore as far as `getByLabel` — is concerned. Use
   `formFieldInput` from `e2e/helpers/forms.ts`, which scopes to the
   `form-item` wrapper instead. (The checkboxes in `MembershipCheckboxes` *do*
   work with `getByLabel`, because the input is nested inside its `<label>`.)
6. **`CardTitle` is a `div`, and cards contain other cards' titles.** So
   `getByRole("heading")` never matches one, and filtering a card by any text
   inside it matches the modal *and* the card holding the button that opened it
   — "Invite User" is both a title and a button label. Use `cardByTitle` in
   `e2e/helpers/users.ts`, which matches the `card-title` slot with an anchored
   regex; a substring match would tie "Invitations" to the page header's "User
   Access & Invitations". Sidebar links share names with card titles too, so
   plain `getByText("Access & Invites")` is a strict-mode violation for any user
   who can see both.
7. **`useConvexForm` busts its memo on `isDirty`.** That is deliberate — save
   bars need to see the change — but it means any `useEffect` that calls
   `form.reset(...)` with `form` in its deps re-runs on the *first edit* and
   throws that edit away. Guard every such effect with
   `if (form.formState.isDirty) return;`. `EditInviteModal` was missing it, which
   made the invitation role and team pickers unable to hold a change at all;
   `user-invite-lifecycle.spec.ts` is what caught it.
8. **Users cannot be seeded per run.** `listUsersForAdmin` returns every auth
   user into an unpaginated table, so a stamped throwaway user per run grows the
   shared deployment forever. Batch 9 reuses fixed `e2e-managed-*` addresses and
   hard-deletes them in `resetManagedUserByEmail`, which refuses anything
   outside that prefix — the admin, crew, and band fixtures are all
   `e2e-*@arborlive.test`, and deleting one would take down every sign-in.
9. **Saving from `/invoices/new` remounts the editor.** `router.replace` moves it
   into the `[id]` route, which re-hydrates every field from the saved invoice
   and reverts anything typed in that window — and the pass is not observable
   from the outgoing component. `createDraftInvoiceWithArtistLine` in
   `e2e/helpers/invoice.ts` absorbs this by loading the canonical URL once and
   waiting for hydration. Client-side navigations also fire no `load` event, so
   `page.waitForURL` can hang for its full timeout; poll `page.url()` instead.


## How to update this doc

When adding or changing e2e coverage:

1. Add/adjust the row in **Coverage by section** (`Covered` / `Partial` / `None` / `Deferred`).
2. Add the spec to **Spec index**.
3. Bump **Last updated** and, if shipping a batch, add a **Batch history** row.
4. Keep deferred items honest — if a flow becomes green in CI, promote it out of Deferred.
5. When a planned batch ships, move its rows from **Planned batches** into history and coverage tables.

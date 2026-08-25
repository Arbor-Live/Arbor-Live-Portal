# Domain Guide

Human-readable overview of the business domains in Arbor Live Portal. The
agent-facing working notes (UI conventions, known high-risk code) live in
`.cursor/skills/arbor-live-portal-app-context/SKILL.md`; this document is the
canonical description of the domain itself.

## Organizations and roles

- Users belong to Better Auth organizations. `organizationProfiles` classifies
  each as `arbor_internal` (staff — the "Arbor Live" org) or `band`.
- **Host organizations** (clients / event hosts) are a separate domain:
  `invoiceGroups` + `invoiceContacts`, not Better Auth orgs. Contacts are
  per-org billing memberships; shared person identity lives in `invoicePeople`
  (keyed by email). Alternate names are stored in `invoiceGroupAliases`;
  admins can merge duplicate hosts in Financial Hub → Organizations.
- Staff-only functionality is guarded by `requireArborInternalContext`; band
  portal surfaces (linked events, media albums, payout status) use
  `requireBandContext` plus `lib/eventBandAccess.ts`.
- The first admin is created at `/setup` while zero admins exist
  (visit that URL directly on a fresh deployment; other routes no longer
  auto-redirect there)
  (see [getting-started.md](getting-started.md)); everyone else is invited
  (`userInvites.ts`, accept-invite → `/onboarding` or `/onboarding/band`).
- Crew onboarding progress lives in `userOnboarding`; band org setup in
  `organizationOnboarding`. Incomplete crew get a dashboard banner and weekly
  reminder email; admins see status under Users and can waive.
- Arbor Live crew invites (and convert-to-member) require a **compensation rate
  mode** (`normal` / `lead` / `custom`) and a **payroll method**
  (`stanford` / `external`). Normal/Lead resolve live from
  `invoiceSettings` (so global rate changes apply automatically); Custom keeps
  a fixed `userCompensationRates.hourlyRateUsd`. Legacy rows without
  `rateMode` behave as Custom. Missing `payrollMethod` defaults to Stanford.
- Crew onboarding branches on payroll method: Stanford keeps FWS → OSE hiring →
  Sequoia hours; External skips those and uses a contractor pay step (email W9
  + biweekly invoice to `arborlive@stanford.edu`).
- Public self-serve band applications: `/artists/apply` → `bandApplications`
  table → admin review at `/dashboard/users/band-applications`. Approval creates
  the band org (no auto public listing), invites the contact/members, and
  pre-stamps identity/members/socials so they only finish rates + payout in
  `/onboarding/band`. Admin-invite onboarding for existing bands is unchanged.
- Public self-serve crew applications: `/crew/apply` → `crewApplications`
  table → admin queue at `/dashboard/users/crew-applications`. Statuses:
  `submitted` → `closed` (farewell email), `trainee` (no Better Auth user —
  shifts use `crewApplicationId`; ICS + trainee intro email go to the
  application email once every required field passes the send gate), or
  `converted` (invite into Arbor Live via the normal member invite path →
  `/accept-invite` → crew onboarding). Crew applicants pick a vertical
  (`Operations` / `Crew` / `Trivia` / `Marketing`); Crew also picks specialty
  (`Sound` / `Lights` / `Design` / unsure) and Fri/Sat standing availability
  (5pm–midnight PT) as a scheduling preference only — not auto-matched to shifts.
- Local UI iteration: `?devPreview=1` (Dev menu) re-opens setup/onboarding
  wizards without redirect — development builds only; see
  [getting-started.md](getting-started.md#dev-preview-wizards).
- Staff capabilities/teams: verticals `Operations`, `Crew`, `Trivia`,
  `Marketing` with Crew disciplines `Sound`, `Lights`, `Design`
  (see `userVerticals.ts` and `userAdminProfiles`).

## Venues

- Venues are a hierarchical catalog (`venues` table) with optional `parentId`
  and a computed `path` (e.g. `Tresidder > Arbor Stage`). Both buildings and
  nested spaces are selectable as event locations.
- Kind/type allowlists: Building (`Dorm`, `Academic`, `Leisure Space`); Indoor
  (`Classroom`, `Theater`, `Conference Room`, `Common Space`, `Other`); Outdoor
  (`Backyard`, `Park`, `Fountain`, `Common Space`, `Other`). Nicknames support
  aliases (e.g. Llaga/Yaga).
- Admin-only management under Events → Venues. Events, series, and booking
  requests store `venueId` plus a denormalized `venueName` (the venue path) for
  display/emails. - Venue records also hold capacity, address, Google Maps URL,
  circuits, contacts, Lexical notes, documentation links, and R2 file uploads.
  Nested spaces inherit address, maps URL, contact, documentation links, and
  files from the nearest ancestor that has them (child-specific values are
  additive for contact/links/files, and override for address/maps).

## Events

- `visibility` on each event: `public` (default, listed on the marketing site),
  `internal` (staff-only), or `informational` (staff-only reference entries that
  are not real producible events). Poster publishing requires `public`
  visibility plus a listable status.
- Hosts: optional primary `hostGroupId` / denormalized `host`, plus optional
  `additionalHostGroupIds` co-hosts on the **event only**. When an event links an
  invoice, primary host is taken from the invoice `groupId` / `clientGroupName`
  (edit on the invoice Client card). Add co-hosts on the event Overview tab.
  Public marketing pages, quote/event portals, and crew surfaces show primary +
  co-hosts joined (`Host A · Host B`).
- Invoices carry a single primary host (`groupId` / `clientGroupName` on the
  Client card). They do not store co-hosts.

Event types (drive which editor tabs and quick-add blocks appear):

| Type | Meaning | Quick-add schedule intent |
|---|---|---|
| `Crewed Event` | Full production with crew | Setup + Show + Strike |
| `Rental with Crew` | Equipment rental plus crew | Setup + Strike |
| `Dry Rental` | Equipment only | Delivery + Return |
| `Services Only` | No schedule/crew tabs | — |

- **Timezone:** the whole portal uses Pacific Time (`America/Los_Angeles` /
  `PORTAL_TIMEZONE` in `@arbor/format`). Display, input hydration/save, day
  keys, and FullCalendar grids must go through that package (or
  `@/lib/format` / `@/lib/crew-availability` wrappers) — never browser local
  time. See `.cursor/rules/portal-timezone.mdc`. **Do not** put “Pacific” /
  “PT” / “PST” labels in the web UI — timezone is assumed app-wide; reserve
  zone names for engineer docs and external emails when needed.
- **Booking requests** can have an `assigneeUserId` (round-robin pool in
  `bookingRequestSettings`, or manual swap on the request detail). Inbox
  defaults to open requests (`submitted`/`in_review`), oldest-first, with a
  days-since-submitted counter.
- **Schedule blocks** (`eventScheduleBlocks`) are the planning unit: typed
  (`setup`/`show`/`strike`/`custom`), snapped to 15-minute increments, may
  overlap (the timeline renders overlaps on separate lanes) and may cross
  midnight. `dayIndex` is anchored to the event **start** calendar day —
  strike may run past midnight after an ~11pm show end without moving
  `events.endAt` (show end and strike end are independent). New blocks default
  to Day 1 of the event and a 1-hour window; the editor lists them by start
  time. Double-clicking the timetable adds a block at that time.
- **Crew shifts** (`eventCrewShifts`) attach to schedule blocks via optional
  `scheduleBlockId`. Legacy shifts without a block must be handled without
  crashing. Shift hours feed expense-report totals and the event's
  `crewCostUsd` (`lib/crewCost.ts`). Trainee applicants can be assigned without
  a portal user via optional `crewApplicationId` (ICS goes to the application
  email).
- Event costs are direct fields on `events` (`crewCostUsd`, `bandsCostUsd`,
  `externalRentalsCostUsd`) — there is no generated expense-report workflow.
  Artists and external rentals are pass-through expenses. Invoice lines may bill
  the host for transparency, but Insights *earned revenue* and net profit exclude
  them from Arbor margin (equipment / crew / fees). Matching `bandsCostUsd` /
  `externalRentalsCostUsd` are not double-counted; overruns still reduce profit.
- **Event series** (`eventSeries.ts`) generate recurring occurrences and have
  their own budgeting and pull lists.
- Band participation in events is tracked in `eventBandParticipations`
  (headliner/support/other). That row is the canonical **assignment**: staff
  manage it from the event overview **Bands & Performers** section (not Media).
  Assigning a band emails members (`band_assigned`), unlocks event media album
  access, and surfaces the show on the band home dashboard. Optional
  `eventBandPayments` attach payout details to the same assignment.

## Booking requests → events → quotes

1. Anyone with a Stanford email submits the public booking wizard
   (`/public/request`, `eventRequests.submitPublic`). Requests get an
   `ALREQ-`-numbered record and a public tracking token (`req_` + double
   UUID). Billing records (`invoiceGroups`, `invoiceContacts`) are provisioned
   server-side by email — anonymous callers can never pick contact records.
2. Staff review requests in the dashboard (`eventRequests.list/get`), can
   convert them to one or more events (`convertToEvent`), and create a draft
   quote linked to the request.
3. Staff use **Send quote to client** (`markReadyForClientReview`) with a
   required personal message. That finalizes the quote, emails
   `booking_quote_ready` (PDF attached; Reply-To = invoice manager +
   `arborlive@stanford.edu`), and sets `clientReviewReadyAt`.
4. The requester tracks status and approves/requests changes on the quote via
   their token URL — no account needed.

## Invoices and quotes

- One table (`invoices`) serves both quotes and invoices; numbering is
  `ALINV-` + 7-char nanoid (requests use `ALREQ-`).
- Lifecycle: `draft` → `finalized` (→ `void`, reversible via unvoid), with a parallel
  `clientApprovalStatus`: `pending` → `approved` / `changes_requested`.
  Voided invoices are hidden from the default Active list filter. Staff can void
  from the invoice list or editor (e.g. cancelled events).
  Default due date is first linked event start (Day 1) + 30 days; staff can
  override, then resync.
- Line items live in a child table, sectioned as equipment package/type,
  external rental, artist, crew, fee. Totals are recomputed server-side
  (`recalculateTotals`); equipment pricing is `subsidized`/`nonSubsidized`
  per host organization (`invoiceGroups`). Host orgs support aliases and admin
  merge so duplicate names resolve to one canonical record; booking can search
  existing hosts or create from free text.
- Artist lines pick a band/DJ (or **Band TBD**) and pull
  `performerHourlyRateUsd` and member count (`bandMembers.length`) from the org
  profile when a band is selected. Linked events auto-fill artist rows from
  assigned performers / payout totals when the invoice has no artist lines yet.
  Artist and external-rental amounts are pass-through (excluded from Insights
  earned revenue and from net-profit margin).
- Every invoice carries a `publicApprovalToken` for the client-facing quote
  page (`/public/quote/[token]`): view, approve, request changes, set payment
  contacts, download PDF — all token-gated, no login.
- PDFs are rendered from `@arbor/invoice-document` (`./pdf` export).
- **Payment proof**: after approval, payers submit payment evidence
  (`paymentProof*.ts`); staff verify, and cron-driven reminder emails nag
  outstanding payers only once fewer than 30 days remain until the invoice due
  date (approval-day first reminder + Monday follow-ups).

## Band payments

- Payouts to performing bands (`eventBandPayments` in `bandPayments.ts`) are
  optional children of `eventBandParticipations`. Staff assign the band first
  (or create a payout which also upserts participation), then set pricing on the
  same overview row.
- Each band org has a designated payee (name/email/mailing address + linked
  user id on `organizationProfiles`).
- Confirmation loop: admin sends a signature-request email from the payout
  queue; the designated payee e-signs under **Bands and Performers → Payments**
  or from the band home show card (typed legal name + amount checkbox). Admin
  then marks paid with a GrantEd transfer / Service Payment number; all band
  members are notified that Stanford is processing the payout. The Payments
  subtab shows a pending chip when the payee needs to sign or payee setup is
  incomplete.
- Band home (`/dashboard`) lists upcoming and recent assigned shows with payout
  status chips (including draft payments and participation-only bookings). Full
  payment history and payee settings remain under Payments.
- Once signed, admins and band members can download an agreement PDF
  (`bandPaymentPdfDownload.ts` via `@arbor/invoice-document`) showing the
  Arbor sender and the payee signature.
- A daily cron promotes payments for ended events into the payable queue.

## Inventory

- `inventoryTypes` (catalog: model, pricing, capabilities, manuals) →
  `inventoryItems` (physical units with `assetId` and storage location) →
  `inventoryPackages` (bundles with per-mode pricing).
- Packages are composed of unnamed **content units** on
  `inventoryPackageOptionGroups` + `inventoryPackageOptions`, with BOM lines on
  `inventoryPackageItems` (`optionId` + `role` primary/accessory). One option =
  always included; two or more = exclusive pick (catalog display until booking
  selection — GitHub #116). Quotes / pull lists / fulfillment use
  `listFulfillmentPackageBom` (single-option units + legacy flat rows). Card
  estimates and suggested package prices include exclusive units via the
  highest-cost alternative (`estimatePackageRentalValueFromContents`).
- Public equipment pages are opt-in via `publicListing` / `publicProfile` /
  `publicSlug` flags; `/e/[assetId]` is the QR lost-and-found page
  (`publicInventory.equipmentByAssetId` + `lostFoundSettings`).
- Images/files upload to Cloudflare R2 (`inventoryR2.ts`,
  [r2-storage.md](r2-storage.md)).
- Rental fulfillment (dry hire / rental with crew): event pull lists remain the
  planning qty source. Crew run **Process delivery** / **Process return** from
  the event Equipment tab (`eventRentalFulfillment.ts`) with camera or typed
  asset scans (`https://arbor.st/e/{assetId}`, schemeless `arbor.st/e/…`, or bare
  tags like `ALE-0041`). Scanning a packout/container
  always auto-checks the asset and every nested contained item. Outbound complete requires
  an explicit disposition (`replace` / `no_tag` / `removed`) for every unchecked
  unit; return complete requires `scanned` / `no_tag` / `missing` / `damaged` /
  `manual`. Client emails go to the linked invoice `clientEmail` only
  (`rental_outbound_packed`, `rental_return_processed`); series-linked invoices
  count. Completing without a client email still succeeds but surfaces a warning
  and a resend action once an invoice email exists.
- Damage reports (`damageReports.ts`): any arbor_internal crew can create
  reports (scope for containers, operability, severity, photo, optional event).
  Operations/admin triage at `/dashboard/inventory/damage`.

## Media (Immich)

- A self-hosted Immich instance stores event/band photo albums. Convex
  creates albums and upload share links (`immichEnsure.ts`,
  `lib/immichClient.ts`); access is scoped by event/band participation
  (`lib/immichAccess.ts`). Marketing can browse/import from a library
  (`marketingImmich*.ts`).

## Marketing site

- `marketingDesigns.ts` — event poster assignments and publishing. Upcoming
  poster work covers events in the next four weeks. Operations or Marketing can
  assign a poster designer from the event editor or design board; assignments
  appear immediately on the board (including internal events). The design board
  filters: assigned to me, unassigned, and all upcoming. Posters publish to
  Instagram and the public event page once the event is public.
- `marketingPosts.ts` — case studies and blog posts, Lexical rich text,
  published/featured flags, rendered publicly via `publicMarketing.ts`
  (`/work`). Public crew and artist directories come from
  `publicDirectory.ts` with per-profile opt-in flags.
- `shortLinks.ts` — custom `arbor.st` redirect overrides managed at
  `/dashboard/marketing/links`. The Cloudflare Worker calls a Convex HTTP
  lookup; unknown slugs pass through to `arborlive.stanford.edu/{slug}`.
  Links can expire manually or 30 days after a linked event; click counts
  are tracked on redirect.

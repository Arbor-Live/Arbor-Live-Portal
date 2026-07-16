# Domain Guide

Human-readable overview of the business domains in Arbor Live Portal. The
agent-facing working notes (UI conventions, known high-risk code) live in
`.cursor/skills/arbor-live-portal-app-context/SKILL.md`; this document is the
canonical description of the domain itself.

## Organizations and roles

- Users belong to Better Auth organizations. `organizationProfiles` classifies
  each as `arbor_internal` (staff — the "Arbor Live" org) or `band`.
- Staff-only functionality is guarded by `requireArborInternalContext`; band
  portal surfaces (linked events, media albums, payout status) use
  `requireBandContext` plus `lib/eventBandAccess.ts`.
- The first admin comes from `bootstrapAdmin`
  (see [getting-started.md](getting-started.md)); everyone else is invited
  (`userInvites.ts`, accept-invite flow).
- Staff capabilities/teams: `Design`, `Marketing`, `Lighting`, `Sound`,
  `Operations` (see `capabilityDefinitions.ts` and `userAdminProfiles`).

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
  display/emails. Venue records also hold capacity, address, Google Maps URL,
  circuits, contacts, Lexical notes, documentation links, and R2 file uploads.

## Events

- `visibility` on each event: `public` (default, listed on the marketing site),
  `internal` (staff-only), or `informational` (staff-only reference entries that
  are not real producible events). Poster publishing requires `public`
  visibility plus a listable status.

Event types (drive which editor tabs and quick-add blocks appear):

| Type | Meaning | Quick-add schedule intent |
|---|---|---|
| `Crewed Event` | Full production with crew | Setup + Show + Strike |
| `Rental with Crew` | Equipment rental plus crew | Setup + Strike |
| `Dry Rental` | Equipment only | Delivery + Return |
| `Services Only` | No schedule/crew tabs | — |

- All event times are fixed to `America/Los_Angeles` in backend logic.
- **Schedule blocks** (`eventScheduleBlocks`) are the planning unit: typed
  (`setup`/`show`/`strike`/`custom`), snapped to 15-minute increments, may
  overlap (the timeline renders overlaps on separate lanes) and may cross
  midnight. Multi-day events use `dayIndex`.
- **Crew shifts** (`eventCrewShifts`) attach to schedule blocks via optional
  `scheduleBlockId`. Legacy shifts without a block must be handled without
  crashing. Shift hours feed expense-report totals and the event's
  `crewCostUsd` (`lib/crewCost.ts`).
- Event costs are direct fields on `events` (`crewCostUsd`, `bandsCostUsd`,
  `externalRentalsCostUsd`) — there is no generated expense-report workflow.
- **Event series** (`eventSeries.ts`) generate recurring occurrences and have
  their own budgeting and pull lists.
- Band participation in events is tracked in `eventBandParticipations`
  (headliner/support/other), which also drives band media album access.

## Booking requests → events → quotes

1. Anyone with a Stanford email submits the public booking wizard
   (`/public/request`, `eventRequests.submitPublic`). Requests get an
   `ALREQ-`-numbered record and a public tracking token (`req_` + double
   UUID). Billing records (`invoiceGroups`, `invoiceContacts`) are provisioned
   server-side by email — anonymous callers can never pick contact records.
2. Staff review requests in the dashboard (`eventRequests.list/get`), can
   convert them to one or more events (`convertToEvent`), and create a draft
   quote linked to the request.
3. The requester tracks status and approves/requests changes on the quote via
   their token URL — no account needed.

## Invoices and quotes

- One table (`invoices`) serves both quotes and invoices; numbering is
  `ALINV-` + 7-char nanoid (requests use `ALREQ-`).
- Lifecycle: `draft` → `finalized` (→ `void`), with a parallel
  `clientApprovalStatus`: `pending` → `approved` / `changes_requested`.
- Line items live in a child table, sectioned as equipment package/type,
  external rental, artist, crew, fee. Totals are recomputed server-side
  (`recalculateTotals`); equipment pricing is `subsidized`/`nonSubsidized`
  per client group.
- Every invoice carries a `publicApprovalToken` for the client-facing quote
  page (`/public/quote/[token]`): view, approve, request changes, set payment
  contacts, download PDF — all token-gated, no login.
- PDFs are rendered from `@arbor/invoice-document` (`./pdf` export).
- **Payment proof**: after approval, payers submit payment evidence
  (`paymentProof*.ts`); staff verify, and cron-driven reminder emails nag
  outstanding payers.

## Band payments

- Payouts to performing bands (`eventBandPayments` in `bandPayments.ts`).
  Each band org has a designated payee (name/email/mailing address on
  `organizationProfiles`).
- Confirmation loop: an email is sent to the payee with a token in the
  subject; the payee's reply hits the Resend inbound webhook
  (`http/resendInbound.ts`), which verifies the svix signature *and* that the
  reply's From matches the designated payee before recording confirmation.
- A daily cron promotes payments for ended events into the payable queue.

## Inventory

- `inventoryTypes` (catalog: model, pricing, capabilities, manuals) →
  `inventoryItems` (physical units with `assetId` and storage location) →
  `inventoryPackages` (bundles with per-mode pricing).
- Public equipment pages are opt-in via `publicListing` / `publicProfile` /
  `publicSlug` flags; `/e/[assetId]` is the QR lost-and-found page
  (`publicInventory.equipmentByAssetId` + `lostFoundSettings`).
- Images/files upload to Cloudflare R2 (`inventoryR2.ts`,
  [r2-storage.md](r2-storage.md)).

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

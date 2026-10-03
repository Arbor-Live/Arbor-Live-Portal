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
  admins can merge duplicate hosts in Ops Center → **Billing hosts**
  (`/dashboard/financial-hub/organizations`).
- The **Users** page (`/dashboard/users`) has three route-based tabs:
  **People** (`?user=<id>` opens a person's panel), **Invitations**
  (`/invitations`, `?invite=<id>`), and **Organizations** (`/organizations`,
  `?org=<id>`) for Arbor Live and the artist orgs. **Add person** in the header
  either sends an invite or creates the account with a temporary password.
  `/dashboard/users/access` redirects to People.
- Staff-only functionality is guarded by `requireArborInternalContext`; band
  portal surfaces (linked events, media albums, payout status) use
  `requireBandContext` plus `lib/eventBandAccess.ts`.
- The first admin is created at `/setup` while zero admins exist
  (visit that URL directly on a fresh deployment; other routes no longer
  auto-redirect there)
  (see [getting-started.md](getting-started.md)); everyone else is invited
  (`userInvites.ts`, accept-invite → `/onboarding` or `/onboarding/artist`).
- Crew onboarding progress lives in `userOnboarding`; band org setup in
  `organizationOnboarding`. Incomplete crew get a dashboard banner and weekly
  reminder email; assigned bands that have not finished onboarding get a weekly
  reminder that payouts are blocked until they complete it. When crew finish,
  admins and leadership get an email that includes the effective hourly rate
  (Normal, Lead, or Custom, resolved the same way as invoice crew pricing), the
  crew member's student type (their `stanfordPosition`, set in the profile step
  and seeded from the crew application), and their payroll type. Stanford-HR/FWS
  recipients (`ONBOARDING_FWS_EMAILS`) are only copied for Stanford-payroll
  hires; external (contractor) crew are not processed through HR.
  Admins see status under Users and can waive, and can switch a person's payroll
  method under User details → **Payment method**.
- Arbor Live crew invites (and convert-to-member) require a **compensation rate
  mode** (`normal` / `lead` / `custom`) and a **payroll method**
  (`stanford` / `external`). Normal/Lead resolve live from
  `invoiceSettings` (so global rate changes apply automatically); Custom keeps
  a fixed `userCompensationRates.hourlyRateUsd`. Legacy rows without
  `rateMode` behave as Custom. Missing `payrollMethod` defaults to Stanford.
- Crew onboarding branches on payroll method: Stanford keeps FWS → OSE hire
  details (student ID, start date, other campus employment + weekly hours) →
  HR I-9 acknowledgement → Sequoia hours; External skips those and uses a
  contractor pay step (email W9 + biweekly invoice to
  `arborlive@stanford.edu`).
- Public self-serve band applications: `/artists/apply` → `bandApplications`
  table → admin review at `/dashboard/users/artist-applications`. Approval creates
  the band org (no auto public listing), invites the contact/members, and
  pre-stamps identity/members/socials so they only finish rates + payout in
  `/onboarding/artist`. Admin-invite onboarding for existing bands is unchanged.
- **Band contact precedence.** An artist org has one booking contact — the
  **Booking & contact** fields (`mainContactName/Email/Phone`) on its profile,
  staff-only (never shown on public artist pages). A rider also carries its own
  **Day-of contact** (`contactName/Email/Phone`). Whenever a band appears on an
  event, the profile booking contact **wins** and the rider's day-of contact is
  only a fallback for artists who never filled the profile. This rule lives in
  `lib/eventContacts.ts` (`buildBandContacts`) and is mirrored in the event
  Contacts card; it feeds the event brief, the public quote contacts, and the
  event Contacts inherited rows. Per-rider day-of contact is still printed on the
  rider itself and used where no event/band context exists.
- **Which rider a show uses.** An act can keep several riders and marks one
  default. From a show's panel on their home (`/dashboard?show=<eventId>`) the
  act can pick a different rider for that show
  (`eventBands.setShowRiderForActiveBand`, stored as
  `eventBandParticipations.riderId`). `lib/showRider.ts` (`pickShowRider`)
  resolves it everywhere (show file, night rider, brief, staff lineup): the pick
  wins while it still exists, else the default, else the latest published
  rider. The printed brief skips a picked draft. Staff see "Picked by the
  artist for this show" next to the rider.
- Public self-serve crew applications: `/crew/apply` → `crewApplications`
  table → admin queue at `/dashboard/users/crew-applications`. Statuses:
  `submitted` → `closed` (farewell email), `trainee` (no Better Auth user —
  shifts use `crewApplicationId`; ICS + trainee intro email go to the
  application email once every required field passes the send gate — a saved
  venue with an address, and one event lead or manager with a name, email and
  phone; an incomplete second contact is skipped. The panel checks
  `traineeEventReadiness` as soon as an event is picked and fixes gaps in a
  dialog: venue + address, event lead, a missing phone), or
  `converted` (invite into Arbor Live via the normal member invite path →
  `/accept-invite` → crew onboarding). Crew applicants pick a vertical
  (`Operations` / `Crew` / `Trivia` / `Marketing`); Crew and Marketing also pick
  a specialty — Crew: `Sound` / `Lights` / `Photography` / `Videography`,
  Marketing: `Design` / `Photography` / `Videography` (each with unsure) — and
  Crew picks Fri/Sat standing availability (5pm–midnight PT) as a scheduling
  preference only — not auto-matched to shifts.
  While `submitted`, an application tracks outreach: an owner
  (`assigneeUserId`) and `outreachStage` (unset = not contacted, then
  `contacted` = Calendly sent, `meeting_booked`, `met`). Whoever first marks
  outreach becomes the owner if nobody is. The queue groups rows by that
  progress, and the sidebar badge counts only applicants nobody has reached out
  to yet.
- Local UI iteration: `?devPreview=1` (Dev menu) re-opens setup/onboarding
  wizards without redirect — development builds only; see
  [getting-started.md](getting-started.md#dev-preview-wizards).
- Staff capabilities/teams: verticals `Operations`, `Crew`, `Trivia`,
  `Marketing`. Specialties are scoped per vertical (`DISCIPLINES_BY_VERTICAL`):
  Crew — `Sound`, `Lights`, `Photography`, `Videography`; Marketing — `Design`,
  `Photography`, `Videography`; Operations and Trivia have none. Only **crew
  specialties** (`CREW_DISCIPLINES`: Sound/Lights/Photography/Videography) fill
  event availability and appear as eligible crew; Design (Marketing-only) and
  the specialty-less verticals are excluded (see `userVerticals.ts` and
  `userAdminProfiles`).
- **User status** (`userAdminProfiles.status`, three states; legacy
  `active: false` migrated to `alumni`):
  - `active` — full participation.
  - `inactive` — real account that can still sign in and reactivate itself from
    a dashboard banner (`users.reactivateMyAccount`). Skipped by availability
    targeting and the weekly digest, and hidden from the public `/crew` page,
    but still assignable to events (shown with an **Inactive** badge in user
    pickers), kept in the timecard overview, and mentionable in comments.
  - `alumni` — no dashboard access (Better Auth `banned`). Hidden from every
    picker, directory, and email; only visible in the Users admin list.
  Change status with the **Access** pill in the person's panel (Users → People), which
  confirms and writes `users.setUserStatusAdmin`; it never touches org
  memberships. Admins can close (alumni) but cannot close their own access.
- **Participation flags** on `userAdminProfiles` (missing ⇒ crew defaults):
  `requiresOnboarding`, `includeInTimecards`, `assignableAsCrew`,
  `weeklyDigest`, `damageReportEmails`, plus existing
  `showOnPublicCrewPage`. Advisors/supervisors use the **Advisor** invite
  preset (no compensation/payroll required): skips crew onboarding, hides from
  timecard overview and assignable-crew pickers, stays off the public
  `/crew` page, and is omitted from Operations damage-report emails. Flags
  remain editable per user in Users admin.
- **Weekly pending-activity digest** (`email/weeklyDigest.ts`, run by the
  Monday `weeklyJobs` cron): Arbor staff get pending availability, shifts that
  week, timecards, and post-event work for events whose show shift they worked
  (review + photos, and only after the event itself has ended). Portal admins also get
  open booking requests and artist payouts in progress. Unsubmitted reviews
  for other people are not listed — a review shows up only when the recipient
  still owes it. Artist-only members get the email only when one of their
  bands has a show that week or onboarding still open — not crew post-event
  work and not the admin queues. Band org admins are Better Auth
  `role: "admin"`; that is not a portal admin. Per-user opt-out is the
  `weeklyDigest` Participation flag; empty sections are omitted and users with
  nothing pending get no email.
- **Post-event work** (`postMortemFeedback.ts`, `lib/myEventActions.ts`): everyone
  who worked the event's `show` shift reviews each ended event — 5⭐ rating + what
  went well / what could improve + resolving their photos/videos. The day-of lead
  and event manager are asked only when they were on the show shift; setup/strike
  crew and assignees with no shift are not. It appears inline on the event **Overview** and as one combined
  **Events → My Post-event work** page (plus the crew Home widget); the email
  link points internal recipients at the event page. The emailed
  `/postmortem/[token]` form remains a fallback. One amber nav badge counts
  events still needing review or photos (subscribed only on home/event routes to
  avoid per-event fan-out on every dashboard page). Leads/admins see an
  attributed per-event average + all responses on the event Overview, and
  Insights rolls up per-event averages alongside every crew/lead review.

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
  (edit on the invoice Client card). Add co-hosts on the event **Billing** tab.
  Public marketing pages, quote/event portals, and crew surfaces show primary +
  co-hosts joined (`Host A · Host B`).
- Invoices carry a single primary host (`groupId` / `clientGroupName` on the
  Client card). They do not store co-hosts.

Event page (`/dashboard/events/[id]`) is one workspace: a persistent header
(title, status, dates, venue, type, host, linked days, series) over six tabs —
**Overview** (details, people, contacts, files & notes, comments, post-event
review), **Run of Show** (timeline + crew), **Equipment** (pull list), **Lineup** (bill,
riders, Open Mic), **Billing** (invoices, hosts, costs, margin — admins and
Operations only), and **Promo** (visibility, marketing, media). One save bar
saves every edited event field (only the changed fields are sent) plus the
schedule and crew; the pull list and contacts keep their own saves. Old
`/expenses`, `/marketing`, `/media`, and `/artifacts` URLs redirect. Creating an
event (`/dashboard/events/new`) is a short essentials-only form.

Event types (drive which workspace tabs and quick-add blocks appear):

| Type | Meaning | Quick-add schedule intent |
|---|---|---|
| `Crewed Event` | Full production with crew | Setup + Show + Strike |
| `Rental with Crew` | Equipment rental plus crew | Setup + Strike |
| `Dry Rental` | Equipment only | Delivery + Return |
| `Services Only` | No Run of Show or Equipment tabs | — |

- **Teams of interest** (`teamsInterested`) are event *needs*, distinct from user
  verticals/specialties (`userVerticals.ts`): `Design` (poster designer +
  uploaded poster), `Photography` / `Videography` / `Sound` / `Lighting` (crew
  shifts), `Promotion` (flyering / outreach), `Trivia`, and `Operations`
  (coordination / artist sourcing). Availability matching (`lib/crewTeams.ts`)
  maps crew specialties onto these needs; events with no needs set are visible
  to all crew. The retired umbrella need `Marketing` was migrated to
  `Promotion`, and poster work now keys off `Design`.
- **Crew availability** (`eventCrewAvailabilityResponses`, My Availability):
  crew answer per event with one tap — *I can work it all* (`yes`), *Some of
  it* (`partial`), *Backup only* (`only_if_necessary`), *Can't make it* (`no`).
  *Some of it* ticks the Run of Show **sections** they can work (stored as
  `partialWindows` with `scheduleBlockId`) and optional **busy times**
  (`busyWindows`, "class 7–9pm"); a busy time unticks the sections it
  overlaps. With no sections yet, the free time around busy times is saved.
  Each answer stores a `scheduleFingerprint` of the sections; when the sections
  change the answer shows as "schedule changed" to crew and admins
  (`lib/crewAvailability.ts`). The inbox, nav badge, weekly digest, and admin
  board all use the same window (`DEFAULT_AVAILABILITY_WEEKS`, 3 weeks).
- **Crew staffing** (`CrewStaffingBoard`, used on the event Schedule tab and the
  invoice crew section): a section's **headcount is its slot count** (open slots
  bill on quotes), set with the − / + stepper. Each section offers the people
  who can work it (available → part → backup), flags anyone booked on an
  overlapping event (`eventCrew.listCrewConflictsForEvent`), and the person
  picker shows each person's availability for that section. *Fill open slots*
  only fills existing open slots with people available for that section and
  free elsewhere; it never adds slots or touches trainees. An event is **fully
  staffed** when every slot has someone and none of them answered *Backup
  only* (`lib/crewShiftKinds.ts`). A slot held by a backup counts as filled
  ("3/3 · 1 on backup") but keeps the event on the needs-crew lists and the nav
  badge, so a better-placed person can still replace them.
- **Trainees** (shifts with `crewApplicationId` and no `userId`) shadow: they
  never fill a slot, never count toward staffing, crew cost, or invoice crew
  lines, and are never removed by "Delete unlinked shifts". Editors that don't
  send `crewApplicationId` back keep it (`eventCrew.upsertShifts`).
- **Timezone:** the whole portal uses Pacific Time (`America/Los_Angeles` /
  `PORTAL_TIMEZONE` in `@arbor/format`). Display, input hydration/save, day
  keys, and FullCalendar grids must go through that package (or
  `@/lib/format` / `@/lib/crew-availability` wrappers) — never browser local
  time. See `.cursor/rules/portal-timezone.mdc`. **Do not** put “Pacific” /
  “PT” / “PST” labels in the web UI — timezone is assumed app-wide; reserve
  zone names for engineer docs and external emails when needed.
- **Booking requests** can have an `assigneeUserId` (round-robin pool in
  `bookingRequestSettings`, or manual swap on the request detail). Inbox
  defaults to open requests (`submitted`/`action_required`/`pending_client`), oldest-first, with a
  days-since-submitted counter.
- **The bill** (event workspace **Lineup** tab) is listed in show order (by set
  time from the Run of Show; acts without a set follow in `sortOrder`), a list of
  *positions* (`eventArtistNeeds.sortOrder`), each with a freeform `label` and
  either filled by an act or still needed:
  - **Artist Needed** (`eventArtistNeeds`) — one open **slot** per row, so "two
    bands and a DJ" is three slots: a `label` (e.g. "Headliner"), `artistType`
    (`band` / `dj` / `singer_songwriter` / `no_preference`), freeform `genres`, and a staff-driven
    `status` (`open` / `inquiring`). A slot is **booked** when an
    `eventBandParticipations` row points at it (`needId`) — never by a stored
    flag, and a slot holds exactly one act (`lib/eventArtistNeeds.ts`).
  - **Run of show** — the event's **Run of Show** tab is one vertical timeline.
    *Sections* (`setup` / `show` / `strike` / `custom`) carry crew; *moments*
    (`doors` / `soundcheck` / `set` / `changeover`) sit inside a section and never
    take crew (crew availability requests list sections only). An act's
    soundcheck and set are schedule blocks linked by `participationId` / `needId`
    (`lib/runOfShow.ts`); the Run of Show edits them (`upsertBlocks` with
    `editsActBlocks`) and writes the times back to the lineup fields
    (`setStartsAt` … on `eventBandParticipations`, or on the slot for an outside
    act) that the band dashboard reads. Lineup shows times read-only. "Build run
    of show" lays out soundchecks (reverse play order by default, ending at
    doors), doors, sets, and changeovers; changeover rows show the night rider's
    cable swaps. Warnings cover soundchecks into doors, overlaps, moments outside
    or past their section, and tight changeovers. A platform act filling a slot
    inherits the slot's times. Copy day setup, duplicate event, and series
    templates skip act blocks. Artists see both windows on "Your shows".
  - **Outside acts** — a position can instead be filled by an act that is not on
    the platform: `eventArtistNeeds.externalArtistName`, with its own set and
    soundcheck windows on the slot. It counts as booked and stops appearing in
    the artist portal.
  - **Every act fills a position.** Acts added without one get a position at
    the bottom of the bill (`lib/actPositions.ts`, named from their role);
    removing an act keeps its position open and hands the act's Run of Show
    times back to it, so the timeline keeps a placeholder.
  - **Lineup UI** — one compact row per position (set time, payout, rider,
    status); details open in a side panel (position settings, fill with a
    platform act / invite / outside act, payout, inquiries, remove). "Add to
    bill" is one dialog for existing artist, invite, outside act, or an open
    position.
  - **Swap positions** — a row's menu has **Swap with…** for when two acts
    trade slots (`eventArtistNeeds.swapPositions`). Positions keep their label
    and Run of Show times; the acts trade places, so each takes the other's
    set and soundcheck. Payouts and invoice artist lines (`needId`) go with
    the act. Swapping into an open position moves the act there.
  - **Payout** — from the position's side panel, via `EventBandPaymentForm`.
  - **Invoice link** — an artist line tied to a day opens the position it
    stands for (`invoiceLineItems.needId`), and filling that position fills the
    line: an internal act sets its `organizationId`, an outside act clears it
    and takes the line's label. Dropping the line drops the position, unless it
    is filled or carries inquiries. One way only — positions never create
    lines.
  Artists browse still-open slots from `/dashboard/opportunities` and
  `submitInquiry` (`eventArtistInquiries`), which flags the slot `inquiring`
  and emails Operations admins (`email/artistNeedInquiryEmails.ts`). Staff clear
  the queue from the position side panel: **Accept** books the inquiring artist
  into that position, marks the inquiry `accepted`, and dismisses the position's
  other open inquiries (`acceptInquiry`); **Dismiss** marks one `dismissed`.
  Each opportunity shows the event's website-visible marketing design's caption
  and poster, and links to the public event page only when the event is public
  and publicly listable. Riders sit in their own card below the bill.
- **Operations lead** (`events.operationsLeadUserId`) — the person responsible
  for filling an event's lineup. Assigned inline on the **Open positions** board
  (`/dashboard/events/positions`), which lists upcoming events with unfilled
  slots soonest-first and can filter to **Assigned to me**. It is a
  coordination flag only and grants no extra event access.
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
- Insights splits a shared invoice (multi-day booking, series, extra links)
  evenly across the live events it covers (`lib/analyticsBookings.ts`), so
  per-event margin, booked-ahead and cancellation totals never count one
  invoice twice. Margin uses booked (finalized + approved) invoices only.
  Insights AR reads the Payments tab's own rows (`collectPaymentRows`), so the
  two always agree.
- **Event groups** (`eventSeries` table, `eventSeries.ts`): dated events that
  share setup and billing. `kind` is `recurring` (a series generated from a
  rule) or `multi_day` (a booking whose days share
  one primary invoice). Days point at their group with `events.seriesId` +
  `occurrenceIndex` (calendar order); `seriesDetached` marks a day overridden
  from the templates. A multi-day group mirrors its invoice's days
  (`lib/eventGroups.ts` `syncMultiDayGroupForInvoice`, called wherever a day
  joins or leaves an invoice): two or more primary days form it, templates
  derive from Day 1, and one remaining day releases the others.
  Recurring series keep their own budgeting and pull lists and are the only
  groups the invoice treats as a "series invoice" (billable counts, equipment
  quantity per occurrence). A single event spanning days (`spansMultipleDays`)
  is not a group.
- **One apply engine** (`lib/eventGroupDays.ts`, `lib/eventGroupTemplates.ts`):
  templates are relative to each day's start — Run of Show sections
  (`blockTemplates`), crew slots per section (`shiftTemplates`) and **positions**
  (`positionTemplates`, applied as `eventArtistNeeds` rows tagged with a
  `templateKey`). Every apply uses one scope: all days · this day and later ·
  this day only; detached and cancelled days are skipped. Applying never
  touches acts' soundcheck/set blocks, assigned crew, or a position that is
  filled, named as an outside act, not open, has a submitted inquiry, or stands
  for an invoice artist line; it only adds, moves or removes open template
  positions and unfilled crew slots, and re-applying is idempotent. A position
  with the same name as a template position (hand-added, or keyed to a replaced
  template) is adopted rather than duplicated; importing from a day keys that
  day's positions and takes a booked act's times. Templates are validated
  server-side (max 50; a length needs a start). "Apply this day's setup" (`eventSeries.applyDaySetup`) makes
  one day's setup the template and applies it to the other days (the pull list
  copies straight across).
- Editing a day with a scope: on a series, "this occurrence only" detaches it;
  on a multi-day booking, other days take only the shared details (venue, type,
  host, people) and keep their own title, times and costs.
- Band participation in events is tracked in `eventBandParticipations`
  (headliner/support/other). That row is the canonical **assignment**: staff
  manage it from the event workspace **Lineup** tab (not Promo).
  Assigning an artist emails members (`band_assigned`), unlocks event media album
  access, and surfaces the show on the artist home dashboard. Optional
  `eventBandPayments` attach payout details to the same assignment.

## Stanford academic calendar and closures

`packages/format/src/academicCalendar.ts` (`@arbor/format`) holds Stanford's
quarters for 2023-24 through 2033-34, from the Registrar's table. It also
holds the no-class days: breaks, finals, MLK Day, Presidents' Day, Memorial
Day, Independence Day, Democracy Day, and the day before spring finals.
Update `YEARS` there when the Registrar publishes new dates.

- **Arbor closures:** winter break, spring break, and all of summer (end of
  spring finals through the day before autumn classes). Arbor is open at
  Thanksgiving and on one-day holidays.
- **Booking requests:** still accepted on closed days. The calendar strikes
  those days through, and the form warns that we may not be able to crew the
  event.
- **Recurring series:** `eventSeries.academicSkipMode` (`breaks` or
  `breaks_and_finals`) drops matching weeks when the series is created and in
  `addOccurrences`. Skipped weeks don't count toward the occurrence count. They
  leave gaps in `occurrenceIndex`, because the index stays the week slot that
  `groupDayStartAt` relies on. The UI numbers days by their position in the
  list (`groupDayLabel`, `occurrencePosition`), never by `occurrenceIndex`. The Days tab flags any occurrence that lands on
  a closure or no-class day.

## Booking requests → events → quotes

1. Anyone with a Stanford email submits the public booking wizard
   (`/public/request`, `eventRequests.submitPublic`). Requests get an
   `ALREQ-`-numbered record and a public tracking token (`req_` + double
   UUID). Billing records (`invoiceGroups`, `invoiceContacts`) are provisioned
   server-side by email — anonymous callers can never pick contact records.
   Initial status is `submitted`.
2. Staff review requests in the dashboard (`eventRequests.list/get`). Marking
   work in progress (or creating a draft quote + tentative event via
   `convertToEvent`) moves the request to `action_required`.
3. Staff use **Send quote to client** (`markReadyForClientReview`) with a
   required personal message. That finalizes the quote, emails
   `booking_quote_ready` (PDF attached; Reply-To = invoice manager +
   `arborlive@stanford.edu`), sets `clientReviewReadyAt`, and moves the
   request to `pending_client`.
4. The requester tracks status and approves/requests changes on the quote via
   their token URL — no account needed. Client approval sets the request to
   `converted` (event going ahead). Change requests or withdrawing the quote
   return it to `action_required`. Voiding the linked quote (or a normal staff
   decline) sets `declined`.

## Invoices and quotes

- One table (`invoices`) serves both quotes and invoices; numbering is
  `ALINV-` + 7-char nanoid (requests use `ALREQ-`).
- Lifecycle: `draft` → `finalized` (→ `void`, reversible via unvoid), with a parallel
  `clientApprovalStatus`: `pending` → `approved` / `changes_requested`.
  Voided invoices are hidden from the default Active list filter. Staff can void
  from the invoice list or editor (e.g. cancelled events).
  Default due date is first linked event start (Day 1) + 30 days; staff can
  override, then resync.
- An event can link more than one invoice. `events.invoiceId` is the primary:
  it drives status, the pull list, the host, and payment reminders. Other
  invoices are rows in `eventInvoiceLinks` (max 12 per event). The event margin
  and pipeline booked revenue add those invoices in. An invoice with no primary
  events still links back to events that list it as additional, and does not
  own their pull list. Extra invoices stay on the occurrence you edit; a series
  still shares one primary invoice.
- Line items live in a child table, sectioned as equipment package/type,
  external rental, artist, crew, fee. Totals are recomputed server-side
  (`recalculateTotals`); equipment pricing is `subsidized`/`nonSubsidized`
  per host organization (`invoiceGroups`). Host orgs support aliases and admin
  merge so duplicate names resolve to one canonical record; booking can search
  existing hosts or create from free text.
- Artist lines pick an artist/DJ (or **Artist TBD**) and pull
  `performerHourlyRateUsd` and member count (`bandMembers.length`) from the org
  profile when an artist is selected. Linked events auto-fill artist rows from
  assigned performers / payout totals when the invoice has no artist lines yet.
  An artist line tagged to a day (`eventId`) applies to that day; an unscoped
  line applies to every occurrence of a recurring series and to Day 1 otherwise
  (`lib/invoiceArtistDays.ts`, from the owning group's kind).
  On multi-day bookings each artist line is tagged to its day/event (`eventId`),
  so the client portal shows **Artist TBD** only on days still missing an artist
  and the invoice↔event import matches lines to the right day.
  Artist and external-rental amounts are pass-through (excluded from Insights
  earned revenue and from net-profit margin).
- **Changing an approved quote** (#405). The client's approval pins a version
  (`invoiceRevisions`, kind `approved`; `invoices.approvedRevisionId` /
  `approvedTotalUsd`). Snapshots use the portal's pricing (`snapshotInvoice`),
  so the amounts are what the client saw.
  - `updateDraft` refuses a save that changes lines, pricing modes, discount or
    terms on an approved quote unless it carries `approvedChange`:
    - `request_reapproval`: saves a `reapproval_requested` version, resets
      approval to pending, and emails the client `quote_updated` (old → new
      total).
    - `keep_approval`: needs a note; saves a `change_kept_approval` version.
    - `match_approval`: keeps the new lines and sets one amount discount
      (new subtotal − approved total) so the total stays what the client
      approved; saves a `matched_approval` version. Only offered when the total
      went up (e.g. crew repriced at the lead rate).
  - Manager, contact, due date and notes save freely.
  - `recalculateTotals`, `recalculateSeriesEquipmentLines` and
    `resyncEquipmentFromPullList` refuse to change an approved quote, and point
    to the editor.
  - The editor autosaves only unsent drafts. Once a quote is sent or approved,
    saves are explicit, and a save that needs a decision opens the
    approved-change dialog (`previewApprovedChange` shows the diff). Cancel
    saves nothing.
  - Quotes approved before versions existed get an approved version snapshotted
    at their first later change (`recordedLate`).
  - Versions show in the editor (Versions card) and in the client portal (Quote
    history, plus a "we updated your quote" banner while re-approval is
    pending).
- Every invoice carries a `publicApprovalToken` for the client-facing quote
  page (`/public/quote/[token]`): view, approve, request changes, set payment
  contacts, download PDF — all token-gated, no login.
- PDFs are rendered from `@arbor/invoice-document` (`./pdf` export).
- **Estimate → final invoice** (#406). An approved quote is an *estimate*
  until staff settle it after the event, once hours are final:
  - `finalizeBilling` sets `billingFinalizedAt`, snapshots a `final` version,
    and opens payment. `reopenBilling` undoes it; it's refused once paid.
  - Staff can open payment before that for a deposit
    (`setPaymentOpenedEarly`, a reason is required).
  - `getPaymentProofOpensAt` is the single gate: payment is open from the
    earlier of `billingFinalizedAt` and `paymentOpenedEarlyAt`, never at
    approval. So reminders, late fees and the payment queue all wait for it.
  - The invoice list shows `estimate` (event upcoming) and `ready_to_finalize`
    (event over; under "Needs you").
  - The portal and the PDF say "Estimate" and ask clients not to pay until
    then.
  - This is not `status: "finalized"`, which means sent/published.
  - Quotes approved before this change keep payment open (migration
    `keepPaymentOpenForApprovedQuotes`).
- **Payment proof**: once payment opens (above), payers submit payment evidence
  (`paymentProof*.ts`). A quote linked as an additional invoice on an event
  (not only the primary `events.invoiceId`) opens payment the same way, and
  proof is stored per invoice. Staff verify, and cron-driven reminder emails nag
  outstanding payers only once fewer than 30 days remain until the invoice due
  date (first reminder the day payment opens + Monday follow-ups via
  `weeklyJobs`).

## Band payments

- Payouts to performing bands (`eventBandPayments` in `bandPayments.ts`) are
  optional children of `eventBandParticipations`. Staff assign the band first
  (or create a payout which also upserts participation), then set pricing on the
  same overview row.
- Each band org has a designated payee (name/email/mailing address + linked
  user id on `organizationProfiles`).
- **Artist payouts** (`/dashboard/financial-hub/artist-payouts`) is a pipeline
  grouped by who acts next (`lib/band-payout-stages.ts`): **Upcoming** (`draft`)
  → **Waiting on artist** (`pending_onboarding`, `pending_payee`) → **Ready to
  send** (`pending_email`) → **Waiting on signature** (`awaiting_confirmation`)
  → **Ready to pay** (`confirmed`) → **Paid**, split into two blocks
  (`PAYOUT_GROUPS`): **Action needed** (Ready to send, Ready to pay — Arbor's
  moves) above **No action needed** (Upcoming, Waiting on artist, Waiting on
  signature, Paid). Each status has one primary
  action (send reminder, send signature request with a preview, resend, mark
  paid) or none; the rest sit in the row's `⋯` menu and the side panel
  (`?payout=<id>` deep link, activity timeline, link to the act in the Lineup
  via `?position=` / `?act=<organizationId>`). Ready-to-send and ready-to-pay
  rows can be selected for batch send (`sendConfirmationEmailBatch`) or batch
  mark paid (`markPaidBatch`, one transfer number for all or one per row; all
  or nothing). "Age in stage" reads `statusChangedAt` / `promotedAt`, stamped on
  every status change (`bandPaymentStatusStamp`), falling back to milestones
  for older payouts. **Remove payout** cancels with the Lineup's confirm.
- After an event ends, payments enter the payout queue. Until then they stay
  **Upcoming** (internal status `draft`). If the artist has not finished (or waived) org onboarding,
  the payment lands in **Pending onboarding**; once onboarded it moves to
  needs-payee or needs-signature request based on payee completeness.
  Completing/waiving artist onboarding refreshes stuck payments immediately.
  **Users → Organizations** shows an **Onboarding** flag on incomplete artist
  orgs; the org's panel lists missing steps with send reminder / recheck payouts. Admins
  can **View as artist** to temporarily activate that org (no membership) and
  see the artist portal; switch back via the sidebar. The payout side panel for
  pending-onboarding lists the missing steps and links to that org's panel.
- When assigning artists, empty events with invoice artist lines get an
  accept/confirm prompt (plus **Import from invoice** anytime). Payout money
  defaults prefer the artist org profile (hourly rate, member count) — it is the
  current source of truth — then the event invoice artist line (rate, hours,
  members) as a snapshot, and leave anything still unknown blank.
- Assigned artists with incomplete onboarding get a weekly reminder email
  (same Monday `weeklyJobs` cron as crew / payment-proof follow-ups, ~6-day
  cooldown) until onboarding is done — staff can also resend from the payout
  queue.
- Confirmation loop: admin sends a signature-request email from the payout
  queue; the designated payee e-signs under **Artists → Payments**
  or from the artist home show card (typed legal name + amount checkbox). The
  signature email includes the event’s Immich share album URL when one exists
  (same album as crew/artist media, booking-request/quote feedback, and the
  post-event album reminder). Outbound emails that include that URL (signature
  request + post-event album reminder) and the public feedback portal ensure
  the event album first when Immich is configured (best-effort; Immich failures
  do not block the email or portal). Admin then marks paid with a GrantEd transfer /
  Service Payment number; all artist members are notified that Stanford is
  processing the payout. The Payments subtab shows a pending chip when the
  payee needs to sign or payee setup is incomplete.
- Artist home (`/dashboard`) lists upcoming and recent assigned shows with payout
  status chips (including upcoming/pre-event payments and participation-only
  bookings). Full payment history and payee settings remain under Payments.
- Once signed, admins and artist members can download an agreement PDF
  (`bandPaymentPdfDownload.ts` via `@arbor/invoice-document`) showing the
  Arbor sender and the payee signature.
- A daily cron promotes payments for ended events into the payable queue.
- Insights upcoming horizons include `upcomingArtistPayoutsUsd` (sum of each
  event’s `bandsCostUsd`, which already includes scheduled artist payouts).

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
  Operations/admin triage at `/dashboard/inventory/damage`: rows default to a
  Status chip of Open + In progress (`damageReports.list` `statuses`, newest 500
  per status merged), and `?report=<id>` opens the report's side panel.
- **Borrow requests** (`equipmentBorrowRequests.ts`): crew submit an
  `ALBRW-`-numbered request for equipment by type or package + quantity, with a
  purpose and pickup/return window (`/dashboard/inventory/borrow-requests`).
  Crew only for now (Arbor Live org context). Step 2 is a loan agreement: one checkbox per
  term (no support, full borrower liability, damage/loss costs, inspection,
  deadlines, usage) plus a typed-name e-signature. Terms live in
  `@arbor/format` `borrowAgreement.ts`; the server requires every term and the
  current version, and freezes the signed text on the request (bump
  `BORROW_AGREEMENT_VERSION` when wording changes). Crew-vertical admins are emailed and see a nav badge. Approval creates an
  internal (`visibility: internal`) `Dry Rental` event and scaffolds its pull
  list from the request lines, so the normal scan-based checkout/return flow
  handles the actual tags. Rejection/cancellation are terminal; requester is
  emailed on the decision. No invoice, billing profile, or public portal.

## Media (Immich)

- A self-hosted Immich instance stores event/band photo albums. Convex
  creates albums and upload share links (`immichEnsure.ts`,
  `lib/immichClient.ts`); access is scoped by event/band participation
  (`lib/immichAccess.ts`). Marketing can browse/import from a library
  (`marketingImmich*.ts`). Event album share URLs surface for crew/artist
  media UIs, public booking-request / quote feedback, and artist payout
  signature-request emails (`resolveEventAlbumShareUrl`). The post-event album
  reminder points internal recipients (lead/crew, who have dashboard accounts)
  at the event **Media** tab so uploads go through the portal, and only sends
  the raw Immich share URL to external clients.
- **Who owes media is the show shift only** (`lib/showShift.ts`): the crew
  reminder and the admin **Crew media uploads** board both target crew whose
  shift is linked to the event's `show` section block. Setup/strike-only crew
  are not asked and are not listed. Events with no `show` block ask no crew. Emails that attach the share
  URL, and the public booking-request / quote feedback portal, ensure the event
  album when Immich is configured (`ensureEventAlbumBestEffort` /
  `ensureAlbumShareUrlByToken`). On multi-day bookings the public **After the
  event** tab uses the same Day 1 / Day 2 switcher as the Event tab: each linked
  day has its own album and feedback form, and the tab appears once any linked
  day has ended.
- Media uploaded to an event is also mirrored into the album of each artist on
  the event lineup (`immichActions.mirrorEventAssetToArtistAlbums`), so an
  artist's album is the single home for all of their photos. `immichAssetRecords`
  is per-album (the same asset may have a row for the event and each artist
  album); uploads to a band album are not copied back to events.
- The public booking-request / quote portals let clients add photos in the
  **After the event** tab for ended events (`publicMedia.ts`,
  `PublicPostEventSection`). Clients upload straight to Immich through the album
  share key, but registration flows through `recordMediaUploadByToken`, so those
  uploads mirror to artist albums too. Token access is scoped to the token's
  linked invoice events and rate-limited. The client post-event email's album
  CTA points at the portal (`albumPortalUrl`) so uploads register, falling back
  to the raw Immich link when no portal token exists.

## Marketing site

- `marketingDesigns.ts` — event poster assignments and publishing. Upcoming
  poster work covers public/internal events in the next four weeks that have
  **Design** selected under Teams Interested (booking conversions add Design
  when the client chose the Collaboration production area). Operations
  or Marketing can assign a poster designer from the event editor or design board;
  assignments appear immediately on the board (including internal events). The
  design board is a list (soonest first) filtered by designer (defaults to "Me",
  also Unassigned or a person) and poster status; `?event=<id>` opens an event's
  side panel, which leads with the poster brief (`getPosterBrief`: when, doors
  and show window from the Run of Show, venue and address, host, and the bill
  with set times) above the poster fields. Design statuses:
  `draft` (staff WIP, not on site), `ready` (on the public event page; Instagram
  not yet approved), `published` (website + Instagram).   Clients can upload from
  the booking-request or invoice tracking link once an event exists
  (`publicEventPoster.ts`); that sets `ready` so the image and optional
  public description (`caption` / About) go live on the public page
  immediately while Marketing still publishes to Instagram. Staff manage the
  same fields on the event workspace **Promo** tab.
- `marketingPosts.ts` — case studies and blog posts, Lexical rich text,
  published/featured flags, rendered publicly via `publicMarketing.ts`
  (`/work`). The admin page is a list; a post opens in a wide side panel
  (`?post=<id>` or `?post=new`) where Publish / Unpublish and Feature on
  homepage are header actions that save the whole form. Public crew and artist directories come from
  `publicDirectory.ts` with per-profile opt-in flags.
- `shortLinks.ts` — custom `arbor.st` redirect overrides managed at
  `/dashboard/marketing/links`. The Cloudflare Worker calls a Convex HTTP
  lookup; unknown slugs pass through to `arborlive.stanford.edu/{slug}`.
  Links can expire manually or 30 days after a linked event; click counts
  are tracked on redirect.

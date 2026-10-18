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
  admins and the Operations team can merge duplicate hosts in Ops Center → **Billing hosts**
  (`/dashboard/financial-hub/organizations`).
- The **Users** page (`/dashboard/users`) has three route-based tabs:
  **People** (`?user=<id>` opens a person's panel), **Invitations**
  (`/invitations`, `?invite=<id>`), and **Organizations** (`/organizations`,
  `?org=<id>`) for Arbor Live and the artist orgs. **Add person** in the header
  either sends an invite or creates the account with a temporary password.
  `/dashboard/users/access` redirects to People.
- Staff roles inside Arbor Live: **admins** (everything); the **Operations
  team** (`Operations` vertical) runs events end to end and books acts. They
  edit every event (details, Run of Show, crew, lineup), create events and
  venues, and work the Ops Center: booking requests, invoices, artist payouts,
  billing hosts, artist applications and Insights. Admin-only: users, crew
  applications and rates, crew timecards, invoice/booking settings, inventory
  setup, deleting events. Everyone else edits only events they lead. Gates:
  `requireOperationsAccess` / `requireAdminOrOperations` (`lib/auth.ts`),
  `canEditEventForUser` (`lib/eventAccess.ts`); the sidebar marks items
  `opsOnly` or `adminOnly`.
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
- **Artist directory** (`/dashboard/artists/directory`, every Arbor staff member,
  not only admins): each active artist, listed publicly or not, with its
  booking contact (same precedence as above), portal members with their profile
  phone, the payee, names listed on the profile, and the next and last show
  (`users.listArtistDirectory`). Search matches people too, and phone numbers
  on digits alone, so staff can paste a number from a group chat
  (`lib/artist-directory.ts`).
- **Artist outreach** (`eventArtistOutreach`): staff track which acts they
  asked to play an event and what each said (Waiting · Available · Can't, plus
  a note). One list per **event**, not per position: an act free that night can
  fill any open slot, and can be tagged for one slot (`needId`) when it only
  fits that one. It is the staff-driven side; `eventArtistInquiries` is the
  artist asking us. Operations team and admins only (`lib/outreachAccess.ts`);
  crew get the artist directory but not outreach. Worked from Open Positions (the event's **Outreach** button,
  `?outreach=<eventId>`) or the Outreach card on the Lineup tab. **Book** fills
  an open slot the act's type fits (the tagged slot first): a portal act joins
  the bill and the slot's pending inquiries close as when accepting one; an
  outside act fills it by name. "Booked" is derived from the lineup, never
  stored. Acts that can't make it fold behind a "Show N who can't" toggle, and
  the Lineup card collapses to its summary once every slot is filled.
  Deleting a position untags its outreach.
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
  dialog: venue + address, event lead, a missing phone). Once the trainee's
  last training shift ends (on an event that wasn't cancelled) they show as
  **Decision needed** (`lib/crewTraineeTraining.ts`; derived, the status stays
  `trainee`) and count toward the sidebar badge until converted or closed), or
  `converted` (invite into Arbor Live via the normal member invite path →
  `/accept-invite` → crew onboarding). Crew applicants pick a vertical
  (`Operations` / `Crew` / `Trivia` / `Marketing`); Crew and Marketing also pick
  a specialty — Crew: `Sound` / `Lights` / `Photography` / `Videography`,
  Marketing: `Design` / `Photography` / `Videography` (each with unsure) — and
  Crew picks Fri/Sat standing availability (5pm–midnight PT) as a scheduling
  preference only — not auto-matched to shifts. It pre-fills the person's
  usual evenings the first time they're asked (see Crew availability).
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
- Admins and the Operations team manage venues under Events → Venues. Events, series, and booking
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
- **Crew availability** is physical time on the person, answered per
  **night**, not per event (`crewAvailabilityNights`, `crewNights.ts`, pure
  rules in `lib/crewNights.ts`):
  - **Usual evenings** (`userAdminProfiles.usualEvenings` +
    `usualEveningsSetAt`): per weekday *Usually free* / *Sometimes* / *Rarely*.
    Everyone is asked once about Thursday, Friday and Saturday and may add
    other evenings. It's a crew onboarding step, a one-time prompt on My
    Availability (plus a dismissible dashboard banner while unset,
    `viewer.needsUsualEvenings` on the session shell), and editable in Account
    settings. The first ask is pre-filled from the crew application's Fri/Sat
    (`crewAvailabilityDays`). It's stored only; it doesn't count as an answer
    yet (staff ranking from it is a follow-up).
  - **Nights.** My Availability shows one card per night that has crewed
    events matching the person (teams/specialties, status, crewed types) in
    the 3-week window (`DEFAULT_AVAILABILITY_WEEKS`), with an **OT** tag on
    overtime events (`events.otPremium`); nights without events
    never appear. A night is the Pacific day of an event's start; anything
    starting before 6 AM belongs to the night before, so a show past midnight
    stays on the night it started. The night's span runs from the earliest
    crew call (any setup, including *Early setup*, or a daytime load-in) to the
    last section or event end. The card lists the events, shows the usual
    pattern as a chip, and answers with one tap: *I'm free* (*Confirm* when
    usually free), *Only part* (tick sections or give free-from/to times minus
    busy times), *Early setup only* (when an event that night has a setup
    section labelled "Early setup…"), *Backup*, *Not this one*. *Dates I'm
    away* writes `no` for every night in a range.
  - **Stored as time.** A row per person per night (`nightKey` Pacific
    `YYYY-MM-DD`): `status` `free` / `partial` / `backup` / `no`, and
    `windows` (for `free` the night span when answered; for `partial` the free
    parts; early setup only = its window). Every event that night reads the same
    row, so one answer covers overlapping events and events added later. A
    changed schedule doesn't make it stale; only time outside the saved windows
    is uncovered (an "I'm free" night that later starts earlier shows as
    needing a re-confirm). An event moved to another night reads that night's
    answer instead.
  - **Staff side (compatibility layer, `lib/crewNightAnswers.ts`).**
    `getSummaryForEvent`, `listPendingCrewForEvent`, `listForAdminOverview`,
    the conflict scan, backups (`loadBackupUserIds`), dashboard home, the nav
    badge, the weekly digest and Insights read nights by `by_nightKey` and
    derive the old per-event answer for team-matched people: every crew section
    covered → `yes`; some time → `partial` (fully covered sections by id, plus
    the free time as windows); none → `no`; `backup` → `only_if_necessary`; no
    night row → not answered. `scheduleChanged` is always false now.
  - **Old answers** (`eventCrewAvailabilityResponses`) were converted by
    `migrations.convertAvailabilityToNights` for every non-cancelled event, past
    nights included so Insights and backups keep their history (`yes` →
    free over the event's crew span, `partial` → its windows minus busy times,
    `only_if_necessary` → backup, `no` → no; on one night the most available
    wins and partial time is unioned). It's idempotent and never touches a
    night the person answered. The old table and rows are kept; nothing reads
    them. `eventCrewAvailability.submitResponse` still works and writes the
    event's night.
  - The inbox, nav badge (unanswered nights), weekly digest (nights to
    answer), home widget, and admin board all use the same 3-week window.
- **Crew staffing** (`CrewStaffingBoard`, used on the event Schedule tab and the
  invoice crew section): a section's **headcount is its slot count** (open slots
  bill on quotes), set with the − / + stepper. Each section offers the people
  who can work it (available → part → backup), flags anyone booked on an
  overlapping event (`eventCrew.listCrewConflictsForEvent`), and the person
  picker shows each person's availability for that section. *Fill open slots*
  only fills existing open slots with people available for that section and
  free elsewhere; it never adds slots or touches trainees. An event is **fully
  staffed** when every slot has someone and none of them answered *Backup
  only* (`lib/crewShiftKinds.ts`), and, on a cart event, the cart rule below is
  met. A slot held by a backup counts as filled ("3/3 · 1 on backup") but keeps
  the event on the needs-crew lists and the nav badge, so a better-placed
  person can still replace them.
  Within each availability level, people with the **fewest shift hours this
  Stanford quarter** come first (chips, person picker, *Fill open slots*, and
  the crew scheduling board's answers), so work spreads out. Hours are every
  shift starting in the quarter, worked or scheduled (`userCards.listShiftHours`).
  **Cart eligible** (`userAdminProfiles.cartEligible`, staff admins set it in
  the person sheet; missing ⇒ no) marks who may drive the golf cart with gear.
  The board tags them "Cart" in the picker and assigned rows, and availability
  pills (the "Can work this" chips, the crew scheduling board's answers and
  waiting-on lists) show a small cart icon labelled "Cart eligible"
  (`CartEligibleIcon`; carried on `invoices.listManagers` and on the board's
  responder and person summaries). The summary lists the cart-eligible
  assignees, or notes that no one on the crew is.
  **Cart events** (`events.needsCart`, *Cart event* switch in the event's
  Details card; copied by *Duplicate*, and by series/multi-day edits that
  aren't "this day only") move gear by cart, so **setup and strike each need
  someone cart eligible**. The setup group is every `setup` section (early
  setup included), the strike group every `strike` section; one cart-eligible
  person anywhere in a group covers it, a group with no sections asks for
  nothing, and trainees don't count (`evaluateCartRequirement` in
  `@arbor/format`, shared by web and Convex). On a cart event the board's
  summary reads "Cart: setup ✓ Maya · strike needs someone cart eligible", and
  each unmet setup/strike section header says "Needs cart person" (muted until
  someone is on that group, then amber). An unmet cart event isn't fully
  staffed: like a backup-held slot it stays on the needs-crew lists (crew
  scheduling board, which flags it, and its KPIs), the nav badge, dashboard
  home, event group days, and Insights' unconfirmed counts. Convex reads it via
  `lib/cartCrew.ts` (`computeEventShiftStats`): nothing extra for events that
  aren't cart events, else the blocks plus one indexed profile read per
  setup/strike assignee not already loaded.
- **Person hover cards** (`UserHoverCard`, `userCards.getCard`): hovering a
  comment author or @mention, a staffing chip, or a name on the crew scheduling
  board shows the person's phone, email, title, pronouns and whether they're
  cart eligible; staffing surfaces
  add hours this week (Mon–Sun) and this quarter.
- **Crew phones**: the event brief's People table and the event Contacts card
  ("Event team") list the event manager and day-of lead (email · phone), then
  everyone on a shift with their profile phone (email if none) and trainees
  with their application phone (`buildEventTeamContacts` in
  `lib/eventContacts.ts`). Public contact views don't include them.
- **Trainees** (shifts with `crewApplicationId` and no `userId`) shadow: they
  never fill a slot, never count toward staffing, crew cost, or invoice crew
  lines, and are never removed by "Delete unlinked shifts". Editors that don't
  send `crewApplicationId` back keep it (`eventCrew.upsertShifts`). Staff
  admins can assign one from the event's Run of Show tab (Trainees → Assign
  trainee): same `assignTraineeToEvent` mutation and readiness check as Crew
  applications, saved right away. The event workspace pulls server trainee
  shifts into its schedule draft (`mergeServerTraineeShifts`) so a later
  schedule save doesn't delete them.
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
    bands and a DJ" is three slots: a `label` (e.g. "Headliner"), `artistTypes`
    (any of `band` / `dj` / `singer_songwriter`, e.g. "band or DJ"; empty means no
    preference — read via `artistTypesOf`, which still understands the deprecated
    single `artistType`), freeform `genres`, and a staff-driven
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
    or past their section, and tight changeovers. *Add → Early setup…* adds a
    setup section before the first setup (default 1 hr) for a small crew who
    stage gear so setup starts with a cart run ready: they either stay on (the
    section ends when setup starts) or leave when soundchecks start (the
    section overlaps setup), and the dialog opens that many slots
    (`planEarlySetup` in `lib/run-of-show.ts`). A platform act filling a slot
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
    set and soundcheck. Payouts, prices and invoice artist lines (`needId`) go
    with the act. Swapping into an open position moves the act there.
  - **Booking price** — each position stores what its act costs
    (`eventArtistNeeds.price`: people × hours × rate per person per hour, or a
    fixed total; `lib/bookingPrice.ts`). It is the one price: the quote's
    artist line bills it and the act's payout pays it (billed = paid). Band
    profile rate and members are only defaults, copied when an act is booked
    into a position nothing prices yet (hours from the set length). The side
    panel's **Price** section edits it (`eventArtistNeeds.setPrice`), which
    rebills a draft quote's line; on an approved quote or a final invoice the
    edit is refused and staff change it from the quote editor (approval
    decision) or reopen billing.
  - **Payout** — from the position's side panel, via `EventBandPaymentForm`:
    payee and status only. Its amount is the booking price; every unpaid,
    uncancelled payout follows price changes (a signed one goes back to
    **Ready to send**, since the artist signed another amount). Paid payouts
    never change.
  - **Invoice link** — an artist line tied to a day opens the position it
    stands for (`invoiceLineItems.needId`), and filling that position fills the
    line: an internal act sets its `organizationId`, an outside act clears it
    and takes the line's label. Dropping the line leaves the position on the
    bill (the quote stops pricing it); moving a line to another day takes its
    position along. One way only — positions never create lines.
  - **Quote Artists section = the bill** — the editor lists each linked day's
    positions in bill order (`layoutArtistBill`): priced ones as lines, the rest
    as open rows to **Price it** or remove from the event. Positions another
    invoice prices are left out. **Add line → Artist** opens a new position
    (`opensPosition`). A line with no performer booked shows on the quote, PDF
    and public quote as an estimate (`ARTIST_ESTIMATE_NOTE`).
  - **Quote prices the booking** — saving a quote writes each artist line's
    price to its position (`syncArtistSlotsForInvoice`), and a price set on the
    Lineup comes back into an open editor (`adoptServerArtistChanges`), like
    the Crew section follows the Run of Show. When an act fills a priced
    position (or a staffed position is priced), it gets a payout at that price
    (`bandPayments.seedFromBookingInternal`) — only when it has no payout on
    the event yet, so a payout staff removed stays removed. Unfilled positions
    have no payout record (no `ALBPAY-`); their price is the plan. A line with no position first adopts one the day already has (its
    act's, one with its name, then the first empty one) and only opens a new
    one when none is free, so a quote fills the bill instead of duplicating it.
    Removing a line's position on the event sets `positionRemoved`, and later
    saves don't reopen it. An open quote editor picks up these lineup changes
    on rows the user hasn't edited (`adoptServerArtistChanges`).
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
  (`/dashboard/artists/positions`, Operations team and admins only), which lists upcoming events with unfilled
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
  `bandsCostUsd` is derived and read-only (`syncEventBandsCost`): every
  uncancelled payout, plus the booking price of each priced position whose act
  has no payout yet (open and outside-act positions included).
  Artists and external rentals are pass-through expenses. Invoice lines may bill
  the host for transparency, but Insights *earned revenue* and net profit exclude
  them from Arbor margin (equipment / crew / fees). Matching `bandsCostUsd` /
  `externalRentalsCostUsd` are not double-counted; overruns still reduce profit.
- Insights splits a shared invoice (multi-day booking, series, extra links)
  evenly across the distinct live events it covers (`lib/analyticsBookings.ts`),
  so per-event margin and booked-ahead totals never count one invoice twice.
  Cancelled value splits across every event on the invoice, cancelled ones
  included, so a cancelled day never claims a live day's share. Margin uses
  booked (finalized + approved) invoices only.
- Insights receivables (`collectOpenReceivableRows`) are every approved,
  unpaid invoice however old its event. They are classified the same way as
  the Payments tab's rows (`collectPaymentRows`). The Payments tab only lists
  events from the last 90 days (its reminder window), so Insights can show
  older debt that the Payments tab doesn't.
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
  `eventBandPayments` attach payout details to the same assignment. Setting or
  moving the act's soundcheck/set times emails each member one calendar invite
  per window (`band_scheduled`).

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
- **Dashboard date ranges:** `apps/web/src/lib/academic-periods.ts` turns the
  calendar into periods: this, last and next quarter, and this and last
  academic year. A quarter runs from its first day of classes to the day
  before the next quarter, so the break after it counts toward it. "Last" and
  "next" quarter skip summer, because Arbor is closed then.
  - **Insights** defaults to this quarter.
  - **Crew scheduling** offers this and next quarter (the range is in
    `?from=&to=`), and the Immich photo browser offers quick picks. Both use
    `AcademicPeriodPicks` (`components/academic-period-picks.tsx`).
  - **Filters and range toggles:** the events list ("When"), invoices
    ("Issued"), open positions, and paid artist payouts.
- **Weeks of the quarter:** `quarterWeek(dateKey)` labels the week ("Wk 1" to
  "Wk 10", "Finals", a break name) on the events calendar and board. Week 1 is
  the week of the first day of classes. A week that is all break
  (Thanksgiving) isn't numbered, and a week whose Monday falls in finals is
  "Finals".

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
- Artist lines pick an artist/DJ (or **Artist TBD**); an unpriced row pulls
  `performerHourlyRateUsd` and member count (`bandMembers.length`) from the org
  profile when an artist is selected. Linked events auto-fill artist rows from
  the lineup's booking prices when the invoice has no artist lines yet.
  An artist line tagged to a day (`eventId`) applies to that day; an unscoped
  line applies to every occurrence of a recurring series and to Day 1 otherwise
  (`lib/invoiceArtistDays.ts`, from the owning group's kind).
  On multi-day bookings each artist line is tagged to its day/event (`eventId`),
  so the client portal shows **Artist TBD** only on days still missing an artist
  and the invoice↔event import matches lines to the right day.
  Artist and external-rental amounts are pass-through (excluded from Insights
  earned revenue and from net-profit margin).
- **Crew hours and OT days.** Crew bill per person per day (one event = one
  day), shared by the quote and event crew cost
  (`@arbor/invoice-document/crew-hours`). Open slots assume the same people
  stay on: per role, the first open slot of every section is one person, the
  second another (2 setup / 2 show / 3 strike is two people all day plus one on
  strike). Assigned crew are matched by who they are; only scheduled hours
  count (no pay through gaps). Each person's first 8 hrs bill at 1×, the rest at
  1.5× (`· OT after 8 hrs`). A day's OT flag is the event's own `otPremium`,
  shown on the event Billing tab and the invoice Details sidebar (one checkbox
  per day on multi-day bookings); an OT day bills 1.5× (`· OT`), then double
  time after 8 hrs (`· DT after 8 hrs`). The client quote and PDF read those
  tags back (`parseCrewLine`). Hand-added extra crew hours and recurring-series
  template lines keep their typed rate.
- **Overlapping shifts count once.** When one person is on two shifts at the
  same time (two events, or two sections of one event), the shared time counts
  once: 7–8pm at A plus 7:45–9pm at B is 2 hrs, not 2¼. The shift that **starts
  first** keeps the shared time; the later one counts `hours − time already
  covered` (never below 0). Ties go to the earlier-created shift; a cancelled
  event's shift never covers anything. One helper does it
  (`crewCountableHours` in `@arbor/invoice-document/crew-hours`; backend reads
  in `lib/crewShiftOverlap.ts`), used by event crew cost (which re-prices the
  other event when they share time), quote crew lines (other events' shifts
  come from `events.getByInvoiceId` / `listCrewConflictsForEvent`), timecards
  (the overlap comes off the later shift's event row, so the day total counts
  it once), hours this week/quarter, the OT forecast and Insights crew
  utilization. Open slots have no person, so they are never deduplicated.
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
      so the total stays what the client approved; saves a `matched_approval`
      version. The amount comes from `matchDiscountToApproval`
      (`lib/approvalDiscount.ts`): when the total went up (e.g. crew repriced
      at the lead rate) it's new subtotal − approved total; when the total went
      down and the quote already has a discount (final crew came in cheaper),
      the discount is lowered to that amount, never below zero and never above
      the existing discount. Not offered when the total went down with no
      discount. The dialog suggests the lowering ("Discount $40 → $20 keeps the
      total at the approved $960") with Lower / Keep buttons; it's never
      applied without that choice.
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
- **Change requests are versions too.** The version history covers the whole
  back-and-forth with the client, not just what happens after an approval:
  - Each send to the client (`markReadyForClientReview`, `sendRevisedQuote`)
    saves a `sent` version with the staff message.
  - A client change request (`requestInvoiceQuoteChanges`) saves a
    `changes_requested` version with their note. `invoices.changesRequestedAt`
    / `clientApprovalNote` hold only the *open* request and are cleared once
    it's answered; the version keeps it.
  - Staff answer with **Reply with revised quote** (`sendRevisedQuote`, a
    required message, `revisedQuotePreview` shows the diff since the request).
    It saves a `sent` version and reopens approval. Request-portal quotes go back
    on the portal (`booking_quote_ready`); others get `quote_updated` with
    `reason: "changes_requested"`. Resending unchanged is allowed, with a reply.
  - `resetApprovalToPending` refuses an open change request, so a request is
    never cleared silently. Requests made before this were backfilled
    (`backfillOpenChangeRequestRevisions`, `recordedLate`) only while still
    open; earlier answered ones only survive in `emailNotifications`.
  - The client portal shows a "we answered your change request" banner (their
    request, the reply, the diff) while the reply awaits their decision.
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
  (or create a payout which also upserts participation); the payout pays the
  booking price set on the act's position.
- Each band org has a designated payee (name/email/mailing address + linked
  user id on `organizationProfiles`). Only an artist admin (`org_admin`
  membership) or Arbor staff can change the payee or rate. Members see them
  read-only and skip that onboarding step. Staff change a membership's role
  from the person panel in **Users**. Add person defaults to Org Admin when
  the artist has no admin yet.
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
  import prompt (plus **Import from invoice** anytime); their price comes from
  the quote.
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
- **Item lifecycle** (`inventoryLifecycle.ts`, `lib/inventoryLifecycle.ts`):
  `inventoryItems.lifecycle` is `active` (absent on the row means active),
  `in_repair` (owned but can't go out) or `retired` (left service, details on
  `retirement`). The old free-text `status` is deprecated; the free-text field
  is now `condition` ("Condition" in the editor). Retirement reasons: `lost`,
  `stolen`, `rma` (may come back), `decommissioned`, `beyond_repair`, `sold`,
  `donated`, `parted_out`, `disposed`, `duplicate` (needs the real item),
  `other` (needs a note). Retiring a case can take its contents with it (they
  stay nested so reinstating the case brings them back) or leave them in
  service. Any retirement can be reinstated. Retiring resolves the unit's open
  damage reports. Outbound rental scans refuse retired and in-repair units
  (and leave them out of a scanned case). Every change
  lands in `inventoryItemHistory`.
- **Retagging** (`inventoryLifecycle.retag`) gives a unit a new `assetId` and
  keeps the old one in `inventoryAssetIdAliases`: scans and `/e/{oldTag}` still
  resolve to the unit, and nobody else can take the old tag.
- **Lists and search**: the items list hides retired units by default (a Status
  chip of "is not Retired"; the header counts units in service) and has a
  Damage chip driven by `openDamageCount`. `searchText` (tags current and old,
  zero-padded `0041` of short numeric tags, serial, type words; see
  `buildItemSearchText`) backs
  the item search index, so ⌘K finds items by any tag, serial or type, with
  retired units listed last.
- Damage reports (`damageReports.ts`): any arbor_internal crew can create
  reports (scope for containers, operability, severity, photo, optional event).
  Each open or in-progress report counts in the item's `openDamageCount`, and a
  `needs_repair` report puts the unit `in_repair`. Operations/admin triage at
  `/dashboard/inventory/damage`: rows default to a Status chip of Open + In
  progress (`damageReports.list` `statuses`, newest 500 per status merged), and
  `?report=<id>` opens the report's side panel, which links back to the item.
  **Retire (beyond repair)** (`damageReports.decommission`) retires the unit as
  `beyond_repair` linked to the report and resolves its open reports.
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

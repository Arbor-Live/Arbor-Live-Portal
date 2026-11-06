# Resend for transactional email

The portal sends transactional email (schedules, invites, booking quotes, band-payment requests, auth flows) through [Resend](https://resend.com). Outbound delivery uses the official [`@convex-dev/resend`](https://www.convex.dev/components/resend) Convex component (for durable, queued sends) alongside the raw `resend` SDK (only for sends that carry PDF/ICS attachments, which the component can't).

## Outbound sending

- The component is registered in [`convex.config.ts`](../packages/backend/convex/convex.config.ts) and instantiated in [`email/resendClient.ts`](../packages/backend/convex/email/resendClient.ts) as `resendClient`, with `testMode: process.env.EMAIL_TEST_MODE === "true"`. It queues, rate-limits and retries sends. Every send passes `idempotencyKey: "emailNotifications:<id>"`, so a retried action never sends the same notification twice.
- Attachment sends ([`email/send.ts`](../packages/backend/convex/email/send.ts) `sendWithResendSdk`) use the raw SDK. They pass the same key as the HTTP `Idempotency-Key` (`emails.send(payload, { idempotencyKey })`). With `EMAIL_TEST_MODE`, they fail before sending if any To or CC isn't a Resend test address, the same rule the component applies. A 429, 5xx or network error reschedules the send after 30s, 2min and 10min while the notification stays queued, then marks it failed with the attempt count.
- Templates are React Email components rendered to HTML in [`email/templates.ts`](../packages/backend/convex/email/templates.ts); sends are enqueued as Convex actions (see `email/enqueue.ts`, `email/triggers.ts`).
- `From`, reply-to, and CC defaults live in [`email/constants.ts`](../packages/backend/convex/email/constants.ts) and are overridable by env var.
- Every calendar-invite email carries **exactly one** event: Gmail and Outlook only add the first `VEVENT` of an invite, so separate windows go out as separate emails.
- Schedule-published, crew, and artist invite emails are **debounced (~45s)** and keyed by content fingerprint so rapid schedule/crew saves (and day-lead recipients) do not flood the same inbox.
- Crew get one invite per run of back-to-back or overlapping shifts (setup + show is one invite; a separate strike is another). A run's UID comes from its first block, so it survives other runs being added or removed. Each run is diffed on its own: a changed run re-sends, a run that disappears gets a **crew-unscheduled** email with an ICS `METHOD:CANCEL` (same UID). Crew who still hold the pre-split merged invite get a one-time "Calendar invite replaced" cancel for it the first time their shifts change.
- Artists get a **band-scheduled** invite per lineup window (soundcheck and set separately) for each active band member, whenever staff set or move those times (lineup or Run of Show). Clearing a window, or taking the act off the bill, sends **band-unscheduled** with a cancel. Windows that are already over are skipped. Outside acts without an account get nothing.
- Pending invites are dropped when superseded (a re-assignment cancels a pending removal and vice versa). Re-sent invites reuse their UID with a bumped `SEQUENCE` (the event's `crewInviteSequence`, shared by crew and artist invites), so calendar clients update the existing event instead of adding a duplicate.

### In-app notifications

Every email whose recipient has a portal account is also mirrored into their
notification center (the header bell). `enqueueEmail` / `enqueueDebouncedEmail`
call `recordInAppNotification` ([`lib/inAppNotifications.ts`](../packages/backend/convex/lib/inAppNotifications.ts)),
which only covers the templates listed there. Auth emails, applicant/client
confirmations, and newsletters stay email-only.

- The row's `path` is the first same-origin link in the payload (a sign-in
  link resolves to its `redirect`). Opening that page in a visible tab marks
  the row read (`components/notifications/notification-auto-read.tsx`,
  matching rules in `lib/notification-paths.ts`).
- Debounced emails create a `pending` row that only appears once the window
  closes; cancelling the debounced email drops it, and delivery replaces the
  previous row with the same debounce key.
- Each configurable template has three independent switches on the account
  page: email (`emailOptOuts`), in-app (`inAppOptOuts`: no row, so no push
  either) and push (`pushOptOuts`: the row still shows in the bell). Checked by
  `isTemplateEnabledForChannel` in `enqueue.ts` and `schedulePushForNotification`.
  Admins editing someone in the person sheet only manage email. The crew and
  artist calendar-invite emails (`crew_*` / `band_*` scheduled/unscheduled)
  carry the `.ics`, so their email can't be turned off (`isEmailRequired`; old opt-outs are ignored), though their bell
  and push can. Rows are pruned after 180 days.

#### Push and the Home Screen app

- Delivered rows also go out as Web Push to every device the user turned push
  on for (Account settings → Push notifications, or the bell's footer prompt).
  `pushDelivery.ts` sends; `public/sw.js` shows the notification, sets the app
  badge, and opens the row's page on tap. Endpoints the push service reports
  gone (404/410) are deleted. Needs `VAPID_*` env vars (see
  [environment-variables.md](environment-variables.md)).
- iOS only allows push from the Home Screen app (`app/manifest.ts`). The first
  time someone opens the portal in a phone browser they get one
  `app_install` notification, and the mobile sidebar shows **Add to Home
  Screen** until they open it from the Home Screen (`appInstall.ts`,
  `appInstalls` table). That launch marks the nudge read. Home Screen apps on
  iOS have their own cookies, so people sign in once more there.
- Reading a row in the app clears it from the OS tray and updates the badge.

### From-address domain

Resend only delivers from a **verified sending domain**. In the Resend
dashboard: **Domains → Add Domain**, then add the DNS records it lists (SPF,
DKIM). `EMAIL_FROM` (and the payments variants) must use an address on a
verified domain, e.g. `noreply@arbor.st`.

### Outbound environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes | Resend API key (`re_...`); used by both the component and the raw SDK |
| `EMAIL_FROM` | Yes | Default From address, e.g. `Arbor Notifications <noreply@arbor.st>` |
| `EMAIL_TEST_MODE` | No | `"true"` only sends to Resend test addresses (`delivered@resend.dev`, `bounced@…`, `complained@…`, optionally `+label`): the component refuses others and attachment sends fail before calling Resend. Test sends still count against Resend quota |
| `E2E_HELPERS` | No (local e2e) | Enables Playwright seed helpers; localhost `SITE_URL` required |
| `E2E_EMAIL_MOCK` | No (local e2e) | With `E2E_HELPERS`, skips Resend entirely after render (no quota). Set by `pnpm test:e2e` |
| `ORGANIZER_EMAIL` | No | Organizer contact shown in emails; defaults to the address in `EMAIL_FROM` |
| `BOOKINGS_EMAIL_FROM` | No | Address client booking emails send from; defaults to `bookings@arbor.st` |
| `PAYMENTS_EMAIL_FROM` | No | From address for band-payment emails; has a default |
| `BAND_PAYMENTS_CC_EMAIL` | No | CC on band-payment emails; has a default |
| `BOOKING_CC_EMAIL` | No | Shared inbox CC'd on client booking emails; defaults to `arborlive@stanford.edu` |

```bash
npx convex env set RESEND_API_KEY "re_xxxxxxxx"
npx convex env set EMAIL_FROM "Arbor Notifications <noreply@arbor.st>"
# optional overrides
npx convex env set PAYMENTS_EMAIL_FROM "Arbor Live — Financial Manager <payments@arbor.st>"
```

## Band emails

Assignment: when a band is first linked to an event (`eventBandParticipations`
insert), members receive `band_assigned` with show details and a CTA to
`/dashboard`.

Show times: soundcheck and set each send their own calendar invite
(`band_scheduled` / `band_unscheduled`, see `email/bandScheduleEmails.ts`).
Anything that writes or removes an act's lineup times must call
`scheduleBandTimeEmails` with the row before and after.

Band payouts use outbound-only emails:

1. **Signature request** (`band_payment_confirmation`) — admin sends from the
   payout queue; payee gets a CTA into the band portal to e-sign.
2. **Payee required** — nudges the band when designated payee info is missing.
3. **Submitted for processing** (`band_payment_completed`) — after admin marks
   paid with a transfer / Service Payment number, all active band members are
   notified that Stanford is processing the payout.

Agreement is recorded in-portal (typed legal name + checkbox), not by email
reply.

## Inbound email

Resend Receiving is on the whole `arbor.st` domain. Its `email.received` webhook
posts to `https://<deployment>.convex.site/email-webhook`
([`http/emailWebhook.ts`](../packages/backend/convex/http/emailWebhook.ts)).
Mail is stored on the booking's request, invoice and event pages, together with
the booking emails we send (see [Booking emails](#booking-emails)). Staff answer
from there (see [Staff replies](#staff-replies)).

- **Signature.** The handler verifies the Svix signature itself
  ([`lib/svixSignature.ts`](../packages/backend/convex/lib/svixSignature.ts),
  WebCrypto, 5-minute tolerance) with `RESEND_WEBHOOK_SECRET` (`whsec_…`, from the
  Resend webhook page). Bad signature → 401, unset secret → 500, malformed body →
  400. Event types other than `email.received` are acknowledged and ignored.
- **Processing.** The webhook only schedules
  [`emailInbound.processInboundEmail`](../packages/backend/convex/emailInbound.ts)
  and answers 200. That action fetches `GET /emails/receiving/{id}` with
  `RESEND_API_KEY`, parses it at the boundary, and calls
  `emailInbound.recordInboundEmail` with the parsed email. A 429, 5xx or network
  error is retried after 30s and 5min, then fails loudly in the logs. For local
  testing, run `recordInboundEmail` with `npx convex run` and no Resend call.
- **Booking addresses.** Each booking has an address on `INBOUND_EMAIL_DOMAIN`
  (default `arbor.st`): a request is `alreq-xxxxxxx@` (its `requestNumber`,
  lowercased), an invoice `alinv-xxxxxxx@` (its `invoiceNumber`) and an event
  `alevt-<eventId>@`. Every page of a booking shows the request address if there
  is one, else the invoice's, else the event's; all of them route. Matching is
  case-insensitive, including older invoice numbers with a mixed-case suffix.
  Managers CC the address on their own threads.
- **Matching order.** The first booking address in To, CC or the envelope
  recipients (`received_for`) that names an existing record wins
  (`matchedBy: "address"`). Otherwise the `In-Reply-To` and `References` ids are
  looked up on stored messages and the first one with a thread wins
  (`matchedBy: "header"`). The request, its invoice and its events share one
  thread (`emailThreads`, resolved by
  [`lib/emailThreads.ts`](../packages/backend/convex/lib/emailThreads.ts)), so
  every address of a booking lands in the same conversation.
- **Unmatched mail.** Anything else on the domain is stored with no thread and
  shown nowhere yet. It stays in `emailMessages` for a later inbox view.
- **Stored text.** `bodyText` is the reply with quoted history cut
  ([`lib/stripQuotedReply.ts`](../packages/backend/convex/lib/stripQuotedReply.ts),
  20k chars); `fullText` keeps the whole plain text (100k chars). Attachments are
  stored as names, types and sizes only.
- **Staff notification.** A matched message sends an in-app notification
  (`booking_email_received`, with push) to the invoice manager, request assignee
  and event manager, except a person whose own email sent it. When none of them
  is a portal user (nobody owns the booking yet), it goes to the portal admins of
  the Crew vertical instead, the same people who get `booking_request_admin`
  (`listAdminUsersForVertical`, gated on `isPortalAdmin`). One notification per
  person per message. No email is sent.

## Booking emails

Client-facing emails about one booking go out as one conversation instead of
separate "Request received", "Your quote is ready" and "Your quote was updated"
threads. An enqueue site passes `booking: { ref }` to `enqueueEmail`, which
calls [`lib/bookingEmail.ts`](../packages/backend/convex/lib/bookingEmail.ts)
`resolveBookingEmail` for the thread, sender, Reply-To, CC and subject. The
notification stores `booking: { threadId, from }`.

- **Templates.** `booking_request_received`, `booking_request_declined`,
  `booking_quote_ready`, `quote_updated`, `payment_proof_reminder`,
  `payment_proof_rejected` and `paying_party_added`. Staff-facing emails
  (`booking_request_admin`, `quote_changes_requested`, `quote_approved`,
  `payment_proof_submitted`, …) keep `EMAIL_FROM`, their own subject and no
  thread.
- **Sender.** `BOOKINGS_EMAIL_FROM` (default `bookings@arbor.st`), with the
  display name `"<Manager name> at Arbor Live"` from the invoice manager, else
  the request's assignee, else `"Arbor Live"`.
- **Reply-To.** The booking's own address: the request's, else the invoice's,
  else the event's, skipping any whose number the inbound parser can't read back
  (an old number with other characters). `bookings@arbor.st` is the last resort.
- **CC.** Every booking email copies `BOOKING_CC_EMAIL` (default
  `arborlive@stanford.edu`). Once the booking has a quote, it also copies the
  quote's manager (`invoices.managerEmail`, else the manager's account email).
  The quote is the request's current one (`linkedInvoiceId`), whichever record
  the email was sent from, so one conversation never copies two managers.
  The request's assignee is never copied: it can still change before the quote,
  and a CC stays in the client's Reply All for the rest of the conversation. CCs
  the caller passes (a staff reply's CC box) are kept; the recipient is never
  copied. `EMAIL_TEST_MODE` copies no one, since it refuses real inboxes. A
  manager's Reply All lands in the portal like the client's.
- **Subject.** One per booking: `Arbor Live booking: <event name> (<ALREQ-… or
  ALINV-…>)`, stored on the thread (`emailThreads.subject`) by the first booking
  email queued. That email uses it as-is; every later one is `Re: ` plus the
  stored subject, so renaming the event does not split the conversation. If the
  client wrote first, the first email is already `Re: `. A failed email that is
  queued again keeps its subject. Each template's own heading ("Quote Ready", …)
  still opens the body.
- **Bell title.** `paying_party_added` also lands in the payer's notification
  center. Its title stays the sentence ("You've been added as the paying party:
  …") through `enqueueEmail`'s `inAppTitle`, not the booking subject.
- **Previews.** The send-quote and revised-quote sheets show the Reply-To, CC
  and subject from `emailThreads.bookingEmailPreview`, which runs the same logic
  read-only and creates no thread.
- **Sending.** Booking emails without attachments go through the component
  with `In-Reply-To` / `References` headers. The quote PDF (`booking_quote_ready`)
  uses the raw SDK (see [Outbound sending](#outbound-sending)).
  `emailOutbound.getThreadHeaders` reads the thread's stored messages, inbound
  and outbound: `In-Reply-To` is the newest message's id and `References` is the
  thread's first id plus the newest nine (ten in all, well under the 998-character
  header line limit).
- **Recording.** `emailOutbound.markBookingEmailSent` marks the notification sent
  and stores the outbound `emailMessages` row (booking sender, `to`, `cc`,
  subject, plain-text body capped at 20k chars, attachment names) in one
  transaction, and bumps the thread. It never notifies staff. If the thread was
  deleted it still marks the email sent and returns `thread_missing`, which is
  logged.
- **Message-ID.** A component send is recorded under the component's email id.
  `emailOutbound.captureMessageId` first asks the component for Resend's id
  (`resendClient.get` → `resendId`) and stores it. Then it calls
  `GET /emails/{id}` and stores `message_id` without angle brackets. Either can
  lag the send (the component retries up to 5 times over ~8 min), so a miss
  retries after 10s, 60s, 5min, 10min and 15min, then logs. A component email
  that failed or was cancelled stops the capture with an error. Until the id
  arrives the row is skipped when building headers.
- **E2E mock.** With `E2E_EMAIL_MOCK` the row is still recorded, with the message
  id `e2e-mock-<notificationId>@arbor.st`, and Resend is not called.
- **Payment-proof reminders.** `email/paymentProofReminders.runFirst` /
  `runMonday` handle 50 events per transaction, then schedule `continueRun` with
  a cursor; the approved invoices with no event are the last batch. The run's
  clock is fixed at the start, so every batch uses the same reminder keys, and
  invoices already reminded are carried along so one on two events gets one
  email.

### Staff replies

The Email card on a booking has a reply box.

**Who.** Portal admins and the Operations team (in Arbor Live's context) may
email clients and make change requests: `sendReply`, `makeChangeRequest` and
`retryReply` use `requireAdminOrOperations`. Any other Arbor-internal user can
read the thread; `getForRecord` returns `canReply` (`hasOperationsAccess`, so
`isStaffAdmin` applies) and the card hides the composer, the change-request
button and "Try again" when it is false. A band-org admin (Better Auth
`role: "admin"`) is not staff and is refused.

`emailThreads.sendReply` queues a `booking_reply` email:

- **To** is the request's email, else the invoice's `clientEmail`, whichever
  parses as a plain address (`clientReplyAddress`; `getForRecord.clientEmail` is
  the same address). Optional CC (bare addresses, max 10); duplicates and the
  client are dropped.
- **From** is the booking sender named after the signed-in staff member
  (`booking.senderName` on `enqueueEmail`), never taken from arguments. A staff
  member with no name sends from plain `"Arbor Live"` (`senderName: null`), not
  the invoice manager's name, and the email drops its "Message from" line.
  Subject, thread, Reply-To and recording are the ones every booking email uses,
  so the reply shows on the thread once it goes out.
- **Body** is the message (max 10k chars) as paragraphs, the sender's name and a
  link to the request tracker, else the public quote. A void quote or an expired
  quote link is never sent. `attachQuote` adds the current
  quote PDF (`payload.invoiceId` plus `payload.attachQuote`, sent through the raw SDK like every attachment; `booking_quote_ready`
  always carries it).
- **Idempotency.** `booking_reply:<threadId>:<clientRequestId>`; the composer
  mints one id per attempt, so a double click queues one email.
- **Failures.** A reply that fails to send stays on `emailNotifications` as
  `failed`; `getForRecord` returns it in `failedReplies` (index
  `by_booking_threadId_and_status`), the card shows it as "Not sent" with the
  error, and `retryReply` queues the same notification again (same idempotency
  key).

`emailThreads.makeChangeRequest` turns a client's emailed message into the formal
quote change request through `requestInvoiceQuoteChanges`, with the message text
(cut to 2,000 characters on a word boundary; the full email stays on the thread)
as the note, and stamps `changeRequestedAt` on the message. It requires an
inbound message from the booking's client that arrived after the current quote
went out for review (`clientReviewReadyAt`; an earlier email is stale), while the
invoice is not void and is still pending. The invoice is the thread's own
(`thread.invoiceId`), else the request's `linkedInvoiceId`, for the button and the
action alike. `getForRecord` returns `canMakeChangeRequest` per message with the
same rules.

**Trust.** "From the client" means the inbound `From` header matches the
request's or invoice's email. Resend Receiving does not give us an SPF or DKIM
result and we store none, so the header can be spoofed. The confirm dialog and
the staff member's judgment of the message are the safeguard; nothing automatic
acts on an emailed message.

### Email summary in event notes

When a client approves a quote, the crew gets the logistics from the email
thread in one place. `approveInvoiceQuote` (the one function every approval path
ends in) schedules
[`bookingSummary.summarizeForInvoice`](../packages/backend/convex/bookingSummary.ts);
a scheduling error is logged and never fails the approval.

- **Input.** The newest 60 messages on the booking thread, inbound and outbound,
  oldest first, sent as a JSON array of `{ direction, sender, body }` (`body` is
  `bodyText`), capped at about 30k characters of JSON by dropping the oldest. A
  client cannot forge a staff message: only `direction`, which comes from our
  database, says who wrote it, and the system prompt calls every body untrusted
  client-written text to treat as data. No inbound message means no model call.
- **Model.** Vercel AI Gateway, OpenAI-compatible
  `POST https://ai-gateway.vercel.sh/v1/chat/completions`, model
  `openai/gpt-5.4-nano`, pinned to OpenAI and Azure with
  `providerOptions: { gateway: { disallowPromptTraining: true, only: ["openai", "azure"] } }`.
  The gateway enforces `disallowPromptTraining` on every plan. Both providers
  list zero-data-retention agreements with the gateway, but the gateway enforces
  zero retention per request (`zeroDataRetention: true`) only on a paid account,
  so this request does not set it. The request sends no `temperature`, since some
  models accept only the default. `AI_MODEL` and the comma-separated
  `AI_PROVIDERS` override both. Set them together: the gateway
  never fails over from the pin, so a model OpenAI and Azure do not serve needs
  its own providers that list zero data retention (`baseten` for `deepseek/deepseek-v4.1-flash`, which needs paid credits). An
  unset or empty providers value keeps the default pin; only the explicit value `none` sends no `only` filter,
  and every such call logs a warning
  ([environment-variables.md](environment-variables.md)). They are read in one
  place, [`lib/bookingSummary.ts`](../packages/backend/convex/lib/bookingSummary.ts).
  It needs `AI_GATEWAY_API_KEY` on the deployment. The default model is in the
  gateway's free tier; a model outside it gets HTTP 403 until the account has
  paid credits.
- **Content rule.** The product owner's rule is in the system prompt verbatim
  ("The note should not include any pricing specific discussion, discounts,
  etc. It should only be operational notes such as venue location or details
  like those.") and enforced again after the model answers. The filter
  (`PRICING_PATTERNS`) runs on the model's raw bullets first, then the count is
  capped at 8 and each bullet cut at 200 characters, so a price late in a long
  bullet is still caught and pricing bullets cannot crowd out operational ones.
  It drops currency symbols and codes, money words (dollars, bucks, price,
  paid, billed, refund, waived, comped, complimentary, for free, tax,
  surcharge, deposit, discount, budget, cost, fee, quote, payment, invoice,
  purchase order or PO, net 30, half off, 3k for the day, and so on). Words
  with a crew meaning only count in a money sense: "rated for 20A", "frame
  rate", "in charge", "charging station", "pay attention", "100% capacity" and
  "total headcount" stay. The table-driven tests list both sides.
- **Who said it.** The crew reads each bullet as something the client said in
  email; the system prompt tells the model the same. That instruction is not
  repeated in the notes.
- **Notes block.** Every event linked to the invoice gets one block per
  invoice, keyed by the invoice number and closed by an end line:

  ```
  Client email summary · ALINV-0042 · quote approved Nov 3, 2026
  - Load-in through the Lagunita lot after 3pm
  (end of client email summary)
  ```

  The portal never deletes or changes staff text. `events.emailSummaryBlocks`
  keeps, per invoice, the exact block text the portal last wrote and the time
  of the transcript it came from (at most 13 entries: an event links at most
  13 invoices). A later run replaces the keyed block only while it still reads
  exactly that text. If staff edited or deleted it, or typed a lookalike
  header, or a header has no end line, the new block is appended after a blank
  line and every existing line stays as it was
  ([`@arbor/format`](../packages/format/src/emailSummaryBlock.ts)). A run whose
  transcript is older than the stored one is skipped, so overlapping runs
  cannot go back in time. No surviving bullets means nothing is written. An
  event linked after approval is not chased: staff use **Add summary to
  notes** on the event page's Email card (`bookingSummary.addSummaryToEventNotes`,
  for Arbor internal users who can edit the event; it is not the Operations
  check that gates replying, because it writes event notes and emails no one).
  The button is awaited, labels the block "as of" the day when the quote is not
  approved, and its toast reports what happened: "Summary added", "Nothing
  operational to add", "No linked event to update" (zero events written) or
  "No quote to key the summary to".
- **Workspace.** The event workspace saves notes as one string and does not
  carry the block into an edited draft. If staff save a draft started before
  the summary landed, the block is lost and their text is intact; the next run
  or the button appends it again. `events.update` never re-inserts it, so
  staff can delete the block.
- **Failures.** A missing key, a gateway error or an unusable reply is logged
  (`[bookingSummary] …`) with no partial write. Logs and toasts carry a status
  and a short error code at most, never model output or a gateway response
  body ("Model reply was not valid JSON"). A 429, 5xx or network error is
  retried once after 60 seconds; the call is aborted after 60 seconds. A 401 or
  403 is never retried: it logs `gateway refused model <model> (<status>):
  <gateway error message> — add paid AI Gateway credits or set
  AI_MODEL`, and the button shows the model and that message in
  its toast.

## This Week at Arbor (newsletter)

The weekly newsletter is the one Arbor send that goes through Resend
**Broadcasts** rather than the transactional queue. That is deliberate: as a
marketing send it needs Resend-managed unsubscribe links, open/click metrics,
and the Broadcasts dashboard, none of which the transactional path provides.

- **Source of truth is Convex.** `newsletterSubscribers` holds the list.
  Subscribing is **single opt-in**: the public forms add the address as
  `subscribed` immediately. Deliberately **no transactional confirmation email**
  is sent — transactional volume is rationed — and the Broadcast carries
  Resend's own per-recipient unsubscribe link.
- **Resend is the delivery mirror.** Subscribed addresses are added to a Resend
  segment. The Monday broadcast targets that segment. Sync failures are stored
  on the row (`syncError`) and surfaced in
  **Dashboard → Marketing → Settings** with a retry action — never dropped
  silently.
- **Send job.** `email/newsletterBroadcast.run` (a `"use node"` action, Monday
  via `weeklyJobs.ts`) builds the coming week's public events, **skips the send
  when nothing is on**, renders `this_week_at_arbor`, and creates+sends the
  Broadcast. Query/mutation helpers live in `newsletterBroadcastData.ts`
  because Node-runtime modules may only export actions.
- **Content.** `lib/newsletterWeek.ts` reuses the same visibility/status filters
  as `publicEvents.ts`, so the email and `/events` never disagree. Window is 7
  days; `NEWSLETTER_MAX_EVENTS` (40) is a loud ceiling, not a silent truncation.
- **Unsubscribe.** Two paths: Resend's own footer link (Broadcasts inject a
  per-recipient `{{{RESEND_UNSUBSCRIBE_URL}}}`), and the in-app
  `/newsletter?token=…` page backed by `unsubscribeToken`. Both flip the row and
  remove the Resend contact from the segment.

### Newsletter environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEWSLETTER_FROM` | No | From address for the newsletter; defaults to `Arbor Live <newsletter@arbor.st>` |
| `RESEND_NEWSLETTER_SEGMENT_ID` | Yes (to send) | Resend segment the broadcast targets. Without it the job fails loudly rather than sending nothing |

```bash
# Create a segment in Resend (Audience → Segments), then:
npx convex env set RESEND_NEWSLETTER_SEGMENT_ID "seg_xxxxxxxx"
npx convex env set NEWSLETTER_FROM "Arbor Live <newsletter@arbor.st>"
```

`RESEND_API_KEY` is shared with transactional mail and must be able to create
contacts and broadcasts.

## Local testing checklist

1. Set `RESEND_API_KEY` and `EMAIL_FROM` on the Convex deployment.
2. Optionally set `EMAIL_TEST_MODE=true` so sends stay in test mode.
3. Trigger a band-payment signature request from Financial Hub → Band Payouts
   and confirm the payee email + portal CTA.

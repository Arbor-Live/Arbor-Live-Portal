# Resend for transactional email

The portal sends transactional email (schedules, invites, booking quotes, band-payment requests, auth flows) through [Resend](https://resend.com). Outbound delivery uses the official [`@convex-dev/resend`](https://www.convex.dev/components/resend) Convex component (for durable, queued sends) alongside the raw `resend` SDK (for sends that carry PDF/ICS attachments).

## Outbound sending

- The component is registered in [`convex.config.ts`](../packages/backend/convex/convex.config.ts) and instantiated in [`email/send.ts`](../packages/backend/convex/email/send.ts) as `resendClient`, with `testMode: process.env.EMAIL_TEST_MODE === "true"`.
- Templates are React Email components rendered to HTML in [`email/templates.ts`](../packages/backend/convex/email/templates.ts); sends are enqueued as Convex actions (see `email/enqueue.ts`, `email/triggers.ts`).
- `From`, reply-to, and CC defaults live in [`email/constants.ts`](../packages/backend/convex/email/constants.ts) and are overridable by env var.
- Every calendar-invite email carries **exactly one** event: Gmail and Outlook only add the first `VEVENT` of an invite, so separate windows go out as separate emails.
- Schedule-published, crew, and artist invite emails are **debounced (~45s)** and keyed by content fingerprint so rapid schedule/crew saves (and day-lead recipients) do not flood the same inbox.
- Crew get one invite per run of back-to-back shifts (setup + show is one invite; a separate strike is another). Each invite is diffed on its own: a changed run re-sends, a run that disappears gets a **crew-unscheduled** email with an ICS `METHOD:CANCEL` (same UID). The first invite keeps the UID from when crew got a single merged invite, so existing calendar entries update in place.
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
| `EMAIL_TEST_MODE` | No | `"true"` restricts `@convex-dev/resend` to Resend test addresses (`delivered@…`); those sends still count against Resend quota |
| `E2E_HELPERS` | No (local e2e) | Enables Playwright seed helpers; localhost `SITE_URL` required |
| `E2E_EMAIL_MOCK` | No (local e2e) | With `E2E_HELPERS`, skips Resend entirely after render (no quota). Set by `pnpm test:e2e` |
| `ORGANIZER_EMAIL` | No | Organizer contact shown in emails; defaults to the address in `EMAIL_FROM` |
| `PAYMENTS_EMAIL_FROM` | No | From address for band-payment emails; has a default |
| `BAND_PAYMENTS_CC_EMAIL` | No | CC on band-payment emails; has a default |

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
reply. There is no Resend inbound webhook.

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

# Resend for transactional & inbound email

The portal sends transactional email (schedules, invites, booking quotes, band-payment requests, auth flows) through [Resend](https://resend.com), and receives **inbound** replies to confirm band payments. Outbound delivery uses the official [`@convex-dev/resend`](https://www.convex.dev/components/resend) Convex component (for durable, queued sends) alongside the raw `resend` SDK (for sends that carry PDF/ICS attachments). Inbound email arrives via a signed webhook handled in Convex HTTP actions.

## Outbound sending

- The component is registered in [`convex.config.ts`](../packages/backend/convex/convex.config.ts) and instantiated in [`email/send.ts`](../packages/backend/convex/email/send.ts) as `resendClient`, with `testMode: process.env.EMAIL_TEST_MODE === "true"`.
- Templates are React Email components rendered to HTML in [`email/templates.ts`](../packages/backend/convex/email/templates.ts); sends are enqueued as Convex actions (see `email/enqueue.ts`, `email/triggers.ts`).
- `From`, reply-to, and CC defaults live in [`email/constants.ts`](../packages/backend/convex/email/constants.ts) and are overridable by env var.
- Schedule-published and crew-scheduled emails are **debounced (~45s)** and keyed by content fingerprint so rapid schedule/crew saves (and day-lead recipients) do not flood the same inbox. Crew notices coalesce to one email per person per event with their full current assignment.
- Fully unassigning someone after they already received a crew invite sends a **crew-unscheduled** email with an ICS `METHOD:CANCEL` attachment (same UID as the invite). Pending schedule emails are dropped; if they are re-assigned before the debounce fires, the cancel email is cancelled instead.

### From-address domain

Resend only delivers from a **verified sending domain**. In the Resend
dashboard: **Domains → Add Domain**, then add the DNS records it lists (SPF,
DKIM, and — for inbound — an MX record). `EMAIL_FROM` (and the payments
variants) must use an address on a verified domain, e.g. `noreply@arbor.st`.

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

## Inbound webhook (band-payment confirmations)

Band payees confirm a payment by **replying to the confirmation email**. Resend
receives that reply and posts an `email.received` webhook to Convex, which
matches the reply to a pending payment and marks it confirmed.

Flow, handled in [`http.ts`](../packages/backend/convex/http.ts) →
[`http/resendInbound.ts`](../packages/backend/convex/http/resendInbound.ts):

1. Resend `POST`s to `/webhooks/resend/inbound` with Svix signature headers
   (`svix-id`, `svix-timestamp`, `svix-signature`).
2. The handler verifies the signature with `RESEND_INBOUND_WEBHOOK_SECRET`;
   unsigned/invalid requests are rejected with `400`.
3. Only `email.received` events proceed. The full message is fetched from Resend,
   a band-payment token is parsed from the subject, and the matching payment is
   looked up.
4. **Fail-closed on sender:** the reply is only accepted if its `From` address
   provably matches the payment's designated payee. A missing/unparseable `From`
   is rejected.

### Webhook setup

1. In Resend, verify the domain's **inbound** MX record so Resend can receive
   mail for the reply address.
2. **Webhooks → Add Endpoint**, pointing at your Convex **site** URL:

   ```
   https://<your-convex-deployment>.convex.site/webhooks/resend/inbound
   ```

   (This is `CONVEX_SITE_URL` + `/webhooks/resend/inbound`, not the app origin.)
3. Subscribe the endpoint to the `email.received` event.
4. Copy the endpoint's **signing secret** into `RESEND_INBOUND_WEBHOOK_SECRET`.

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_INBOUND_WEBHOOK_SECRET` | Yes (band payments) | Svix signing secret for the inbound webhook endpoint |

```bash
npx convex env set RESEND_INBOUND_WEBHOOK_SECRET "whsec_xxxxxxxx"
```

## Email preview workflow

Templates live as React Email components in [`packages/email/emails`](../packages/email/emails) with sample props in `emails/_preview-props.ts`. Preview them in a browser without sending:

```bash
pnpm dev:email
# → react-email dev server on http://localhost:3001
```

Note: the root `pnpm dev` already starts this preview server in parallel with
the web and backend dev processes (see [`getting-started.md`](./getting-started.md)),
so a standalone `pnpm dev:email` is only needed when working on templates alone.

Because the same `@arbor/email` render helpers back both the preview server and
the Convex send path, what you see at `:3001` is what recipients receive.

## Verification

1. Set `RESEND_API_KEY` + `EMAIL_FROM` (verified domain) on the deployment.
2. Trigger a send (e.g. publish a schedule) and confirm delivery / a row in the
   Resend dashboard logs. Set `EMAIL_TEST_MODE=true` first to dry-run.
3. For inbound: set `RESEND_INBOUND_WEBHOOK_SECRET`, send a band-payment
   confirmation email, reply from the payee address, and confirm the webhook
   marks the payment confirmed. A reply from any other address must be ignored.

Here's the full handoff context.

## What this session is about

**PR #247** on `Arbor-Live/Arbor-Live-Portal`: *"Add weekly This Week at Arbor newsletter and public calendar feed"*. Branch `t3code/weekly-arbor-summary-email`. Two features were built this session:

1. **"This Week at Arbor" weekly newsletter** — Convex-stored subscriber list (`newsletterSubscribers`), public opt-in (landing + Open Mic + `/newsletter` prefs page), admin subscribers panel, and a Monday cron that builds the week's events and sends via **Resend Broadcasts** to a **Resend segment** (deliberately not the transactional queue).
2. **Public ICS calendar feed** — `GET /calendar.ics` (Convex HTTP) proxied through the web app at **`arborlive.stanford.edu/events/calendar.ics`**, with Google/Apple/Outlook subscribe links.

## Current in-flight work: PR review fixes

CodeRabbit posted **15 inline review comments**. I'm working through them. **Status so far:**

**Done and verified:**
- `newsletterWeek.ts` — window boundary (`weekLabelFor` now uses `days - 1`; added `newsletterWindowEnd` + `isEventInNewsletterWindow` with **exclusive** upper bound). Truncation warning added. Tests pass (14 across both lib files).
- `publicCalendar.ts` — **switched DTSTART/DTEND to UTC with `Z`** (RFC 5545 requires VTIMEZONE for every TZID; verified via RFC + spatie/calendar-links issue — Outlook desktop 2007–2013 misreads bare TZIDs as floating time). Rewrote `foldIcsLine` to count **UTF-8 octets** via `TextEncoder` and split only at code-point boundaries. Tests added incl. non-ASCII CJK case. Passes.
- `newsletter.ts` — public source now excludes `admin` (`publicSourceValue`); 120-char name cap server-side; retry `syncContact` when subscribed row has `syncError`/no `resendContactId`; passes `expectedUpdatedAt` to removal job.
- `newsletterBroadcast.ts` — `removeContactFromSegment` now guards `status !== "unsubscribed"` and stale generation via `expectedUpdatedAt`.
- `newsletterBroadcastData.ts` — `getSubscriber` now returns `updatedAt`.
- `calendar-feed.ts` — wrapped `upstream.text()` in try/catch → 502.

**NOT yet done:**
- `newsletter-subscribers-manager.tsx` — add confirm dialog for "Send now" (destructive, label "Send newsletter"), disable button while pending, and add backend dedup so concurrent sends can't create multiple broadcasts. **This is the one "Heavy lift" comment.**
- `newsletter-preferences.tsx` — set `destructive: true` in `handleUnsubscribe` confirm.
- `open-mic-wizard.tsx` — error-state copy says "try again from the events page" but checkbox stays enabled; either fix copy or disable checkbox on error.
- `this-week-at-arbor.test.ts` — change `toBeGreaterThanOrEqual(1)` → `toBe(1)` for exactly one `/open-mic` link.
- **Typecheck/lint/tests after all edits** (backend typecheck not yet re-run since the newsletterBroadcast changes).
- **Reply to all 15 review comments** with fix commit or justification.
- **Verify CI passes.**

## Important caveats / gotchas

- **One review comment is partially wrong:** CodeRabbit said to use "the `id` field" for `contacts.segments.remove`. I checked the installed SDK (`resend@6.18.1`) — the field is `contactId`. Keep `contactId` and explain in the reply.
- **Multiple edits were lost mid-session** because I was editing files concurrently (a `days - 1` change silently didn't apply once). **Re-read files before editing** and re-verify with tests.
- Tool calls were intermittently rendering empty. Small, single `bash`/`edit` calls work better than large ones.
- **Local env:** worktree is in **local Convex mode** (ports 3340/3341), started via `pnpm dev:backend:local`; web via `pnpm dev:web` (`:3000`). Both die easily — restart if you get `ECONNREFUSED 127.0.0.1:3341`.
- Local Convex data lives in `packages/backend/.convex/local/default/`; I wiped it earlier to get a clean schema push (safe, disposable).
- **Pre-existing failures on base, not ours:** 15 eslint errors in unrelated files, and `packages/rider-document` typecheck fails on base too.

## There is ALSO uncommitted UI work not yet shown

The user's last UI request: **remove the raw feed text link, add a "Stay in the loop" heading combining the mailing form + calendar invite, be tasteful, and show the result.** I already wrote:
- `newsletter-signup-form.tsx` → now exports `LandingStayInTheLoop` (two-column grid: "Weekly email" + "Calendar feed"), removed the raw URL from `calendar-subscribe.tsx` (now inline text links: Google / Apple / Outlook / Copy link + event count).
- `events/page.tsx` uses `LandingStayInTheLoop`; `public-events-grid.tsx` no longer embeds `CalendarSubscribe`.
- **I have NOT yet shown the result to the user** — need to start dev servers, screenshot, and present it.

## Honest status

Nothing has been committed this session. All changes are uncommitted in the worktree. The user asked "all done?" several times and I was still mid-work — I had not yet committed or replied to any review comments.

**Suggested next steps:** finish the 4 remaining review items → typecheck/lint/test → commit → reply to all 15 comments → check CI → then screenshot the "Stay in the loop" UI and show the user.



Delete this file one donce

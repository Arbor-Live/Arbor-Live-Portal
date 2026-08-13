# Branch notes: `fixes/mutli-day-events`

Working notes for the multi-day booking / quote UX work (uncommitted until landed).

## Goals

- Toggle Day 1 / Day 2 / … on a multi-day quote and event editor without leaving the booking flow.
- Copy crew **hours / open slots** (not assignees) and pull-list / checkout quantities across linked days.
- Quote artist lines as **Hours × People × Rate / person / hr** (persisted + PDF/web docs).

## Follow-up fixes while testing (this session)

### Crew overview showed $0

**Why:** Open-slot cost estimates only used `estimatedHourlyRateUsd` stamped on the shift. That was often missing (or cleared when global rates were `$0` at save time), and `calculateCrewCost` did **not** fall back to global Normal/Lead rates — even though Crew Rates UI copy says empty estimates use the average of both.

Invoice crew dollars also stay `$0` when **Users → Crew rates** Normal/Lead are unset (fresh anonymous deploys default to `0`).

**Fix:** Open slots fall back to average(Normal, Lead) in cost calc + upsert; warn on event overview and quote totals when rates are unset. Set rates at `/dashboard/users/crew-rates` if you still see `$0` after a save.

### Fake asset create: “Unknown or inactive category key”

**Why:** On an empty taxonomy DB, the create-asset UI fell back to hardcoded category labels (`sound`, etc.) that were **not** inserted yet. Create then failed validation.

**Fix:** Seed built-in categories when creating a type if the key is missing; auto-ensure defaults from the asset wizard / types manager; stop showing phantom categories once the categories query has resolved empty.

### Per-person Lead rates on the invoice

**Why:** Invoice crew lines used the invoice-wide Normal/Lead mode for *every* row, so an assigned Lead ($22/hr) was still billed at Normal ($20/hr).

**Fix:** Assigned crew bill at their compensation rate (Normal / Lead / Custom). Lead assignees are labeled `(Lead)` in the crew line (and shown in the assignee picker). Open slots still use the invoice crew-rate-mode default. Backend keeps the stamped per-line rate instead of overwriting with the global mode.

## How to recover this chat (CLI)

Session token is kept in `multi-day-events-session-token.txt` at the repo root. Resume with your CLI’s chat resume flag using that UUID.

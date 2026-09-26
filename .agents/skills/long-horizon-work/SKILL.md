---
name: long-horizon-work
description:
  Working unattended for a long time: polling CI and review bots on a
  cadence, waiting out rate limits, keeping the tree working between
  attempts, and verifying before claiming success. Use when asked to work
  "async", keep going until something is mergeable, babysit a task for
  hours, or iterate autonomously while the user is away.
---

# Long-horizon work

For the PR-shaped version of this (open → green → reviews → mergeable), see the
`pr-babysitter` skill. This one is about the *unattended* habit around it: a
human is asleep, you have hours, and the only thing that matters is that they
wake up to something that works.

## Define done before you start

Write down the stop condition in the first message: "CI green, CodeRabbit
settled, `mergeable: MERGEABLE`", "all five findings fixed", etc. Everything
below serves that. Without it you will invent stopping points.

The one legitimate early stop is a **decision only the human can make** (a
product fork, a credential, a merge). Say it in one line and keep doing
everything else that does not depend on it.

## Cadence, not spinning

- Poll on a timer sized to the work. This repo's Playwright shards run 7–9
  minutes, so a poll every ~9 minutes is right; `sleep 540` then one `gh pr
  checks`. Sleeping in chunks and re-reading state beats both tight loops
  (burn) and long blind waits (stale).
- Batch: one message, several independent reads in parallel (`checks` +
  review bodies + the failing job's log).
- Never re-read what you already know. Cache the sha you last acted on.

## Always read the real artifact

A red check names the file and line — go get it:

```bash
gh run view --job <id> --log-failed | rg "✘ |Error: expect|spec.ts:"
```

Do not guess from the check name, and do not blind re-run. The same goes for
review bots: fetch the review **body** (the findings live in it, sometimes
only as "outside diff range") and the inline comments.

Note this repo's test selector gotcha: many test *names* contain the same
words as failures, so `rg "field"` matches passing lines. Match `✘ ` and the
summary lines instead.

## Leave the tree working between attempts

This is the mistake that costs the most, because the user may touch the app
mid-flight:

- **Never leave a half-applied edit.** A file that does not parse is worse
  than no change. If a mechanical rewrite is even slightly tricky, finish it
  in the same step, or `git checkout -- <file>` and do it smaller.
- Prefer several small, verifiable edits over one clever one. Large
  brace-matched splices are how you end up with broken JSX — if you must,
  assert your anchors (`assert old in text`) and re-read the result.
- Before handing the app back (or pushing), run the gate chain:
  `pnpm --filter backend typecheck` → `pnpm --filter web typecheck` →
  eslint on touched files → `pnpm --filter web build`.
- When you remove a piece of state, grep for every setter of it. Removing
  `dragArmedKey` while `setDragArmedKey` was still referenced left the module
  uncompilable and the page dead — "the feature does not work" and "the file
  does not compile" look identical to a user.

## Verify the behavior, not the build

A green build proves nothing about what a person sees. If browser control is
available, exercise the flow yourself and read the DOM back:

- Click the thing, then assert the DOM actually changed (`document.querySelector`
  counts, option labels, enabled/disabled), rather than assuming.
- React-controlled inputs ignore synthetic `input` events — to test typing,
  either drive real key events or check React state, not `.value`.
- Embedded/automation browsers are flaky: a tab can land on
  `chrome-error://chromewebdata/` or lose its session. Open a fresh tab and
  re-sign-in rather than concluding the app is broken. The dev server is fine
  if `curl` returns a status.
- When the automation fights you (popovers that will not open, drags that
  will not start), drive the same code path through the CLI/seeded data
  instead and say which path you verified.

## Waiting out rate limits

Review bots meter per hour. When one says rate limited or paused:

1. Note the timestamp of the last *completed* review.
2. Do something useful until roughly an hour after it.
3. Ask again **once**. Repeated requests can extend the window — if it says
   rate limited twice, stop asking and report.

A rate-limited bot still reports its check as `pass`; it does not block a
merge. Do not stall the loop on it.

## Keep the state you need in reach

Long sessions lose context that the shell still has:

- Local env files get rewritten by tooling. If a CLI suddenly cannot find its
  deployment (this repo: `CONVEX_DEPLOYMENT` in `packages/backend/.env.local`),
  re-add it and carry on rather than re-bootstrapping everything.
- Note which mode the worktree is in (`pnpm worktree-convex status`) and which
  ports are live before assuming a service died.
- Seeded data is the cheapest way to make a flow checkable — prefer a seed
  helper or a one-off `npx convex run` over clicking through setup.

## Reporting while you go

Short status, then keep working. No preamble, no victory laps: "pushed `abc123`,
CI green, CR rate-limited until ~09:30". When you interrupt the user, it should
be to unblock, not to narrate. If you are about to say "done", it means the
stop condition is met — and you checked the artifact that proves it.

## Observed failure modes (do not repeat)

- Splicing a large block with a brace match that landed early, leaving the JSX
  broken and pushed.
- Reading React state inside a native event handler (drags, window listeners)
  — it is stale; use a ref.
- Assuming a helper's return shape (`path`/`title`, not `eventPath`/`eventTitle`)
  instead of checking it; the test then navigates to `undefined/...`.
- `forEach(async …)` instead of `for … await`, so writes raced.
- Setting an optional field with `ctx.db.patch({ field: undefined })` to clear
  it — Convex ignores `undefined`; use `replace`.
- Claiming a feature works because it typechecks.

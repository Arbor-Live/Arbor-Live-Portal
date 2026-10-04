---
name: autonomous-dev
description:
  End-to-end autonomous feature delivery. Build the feature, ask the user only
  when a decision is genuinely theirs, verify it in the browser, open the PR
  with screenshots (shown in chat and embedded in the PR body), then own the
  CodeRabbit review loop, including its review limits, until the PR is
  mergeable. Use when the user says "build this autonomously", "take it to a
  PR", "ship this end to end", or hands over a feature and expects a
  mergeable PR back.
---

# Autonomous development

Brief in → mergeable PR out. This skill strings together the rest of the repo's
guidance; it does not replace it:

- `arbor-live-portal-app-context` (+ `dashboard-design` for `/dashboard` UI)
  for how to build things here.
- `pr-babysitter` for the verify → PR → CI → reviews checklist.
- `long-horizon-work` for unattended habits: cadence, always reading the real
  artifact, keeping the tree working between attempts.

Stop at **mergeable**. Never merge unless the user said to.

## 0. Define done up front

In your first reply, state in 2–4 lines: what you will build, the assumptions
you are making, and the stop condition (normally "CI green, CodeRabbit
settled, no unresolved threads, `mergeable=MERGEABLE`"). Then start working.
Do not wait for approval of the plan unless step 1 says to ask.

## 1. Ask only when necessary

Ask (via `AskUserQuestion`, a few options, recommended one first) **only**
when:

- The brief allows two product behaviors that users would notice differently,
  and the code and docs do not settle it.
- The change is destructive or hard to reverse: data migrations on real data,
  deleting user-visible features, changing money/invoice math, anything
  touching prod or the shared trunk Convex deployment.
- You need a credential, account, or paid service.
- Scope would grow well past the brief (it is really two PRs).

Everything else, decide yourself: naming, layout within existing patterns,
component choice, test shape, copy that follows existing tone. Record each
non-obvious call under **Decisions I made** in the PR body so the user can
overrule it in review instead of being interrupted now.

While a question is pending, keep doing all the work that does not depend on
the answer.

## 2. Build

- Branch off up-to-date `main` (`git fetch && git rebase origin/main`).
- Feature-branch backends are **local** Convex only: `pnpm dev:backend:local`,
  then `pnpm dev:web`. Never push schema to the shared trunk deployment.
- Read `convex/_generated/ai/guidelines.md` before touching Convex code.
- Small, verifiable steps. Keep the tree compiling between them
  (`long-horizon-work` → "Leave the tree working between attempts").
- Add/adjust unit tests and E2E coverage for behavior changes (`e2e-testing`).
- Before calling it done, run `deslop` on your diff and the gate chain:
  `pnpm lint && pnpm typecheck && pnpm test`, plus `pnpm test:e2e` (or the
  affected specs) for behavior changes.

## 3. Verify in the browser and capture screenshots

Required for any user-visible change. A green build proves nothing about what
users see.

1. Open the app with the T3 preview tools (`preview_open` on
   `http://localhost:3000`, then `preview_navigate` / `preview_click` /
   `preview_type`). Local Convex is empty: bootstrap via `/setup`, the Dev menu
   (`?devPreview=1`), or seeded data first.
2. Walk the happy path and at least one edge case (empty state, validation
   error, long content). Check the console for new errors.
3. Capture the states a reviewer needs: before/after where it applies, the
   main flow, and one narrow viewport (`preview_resize`) if layout changed.
   Use `preview_snapshot` with `save: true`; it returns `screenshotPath`.
   If styling changed, also capture dark mode (`preview_set_appearance`).
4. **Show them in chat** by embedding the saved paths:
   `![Ledger page, desktop](/abs/path/from/screenshotPath.png)`.
5. **Playwright is an equally valid path.** Switch to it whenever the T3
   browser is unavailable or fights you (popovers that won't open, drags that
   won't start, lost sessions, `chrome-error://` tabs), or when a scripted
   run is simply more reliable, e.g. multi-step flows or several viewports.
   Write a throwaway spec under `apps/web/e2e/`, reuse the role sessions
   from `e2e/.auth/*.json` via `test.use({ storageState })` (see
   `e2e-testing`), and call `await page.screenshot({ path, fullPage: true })`
   at each state. Embed those PNG paths in chat exactly like step 4. Delete
   the spec afterwards unless it is worth keeping as a real test. Say which
   path you used.

Fix anything ugly or broken that the screenshots reveal before opening the PR.

Two traps when judging "nothing broke":

- **Code that runs inside Convex must be checked through Convex.** PDFs
  (`@react-pdf`) and email rendering also run in Convex node actions, which
  bundle dependencies differently from Node or Vitest. A PDF that renders in
  a test can still fail in the action (`@react-pdf/renderer` 4.9 did). Call
  a real action, e.g. `convex run paymentProofPublic:downloadInvoicePdfByQuoteToken`
  with a token from `e2eHelpers:seedMinimalPublicQuote`.
- **On a loaded machine, compare against `main` before blaming the change.**
  1s query timeouts in `findAuthUserById` and "You must be signed in" right
  after sign-in show up when CPU is starved. Run the same check on a `main`
  build, alternating the two, before calling it a regression.

## 4. Open the PR (with screenshots)

1. Commit only intended files (no screenshots in the feature branch, no env
   files). Push the branch.
2. Upload the screenshots to an orphan branch per PR named
   `pr-assets/<pr-number>-<slug>` (the repo's existing convention; nothing
   triggers CI on it, since workflows run on `pull_request` and pushes to
   `main`). The repo is public, so raw URLs render in the PR. If the PR has
   no number yet, open it first and add the screenshots by editing the body.

   ```bash
   tree=$(for f in 1-main-flow.png 2-narrow.png; do
     printf "100644 blob %s\t%s\n" "$(git hash-object -w "$f")" "$(basename "$f")"
   done | git mktree)
   commit=$(git commit-tree "$tree" -m "Screenshots for #<n> (PR assets only)")
   git push origin "${commit}:refs/heads/pr-assets/<n>-<slug>"
   ```

   Embed `https://raw.githubusercontent.com/{owner}/{repo}/${commit}/<file>`
   (pin the commit SHA, not the branch name, so links survive re-uploads).
   Number files in reading order. In zsh, brace the variable (`${commit}:`),
   otherwise `$commit:r` is read as a path modifier.
3. `gh pr create` with a body written for the reviewer:
   - **What & why** (2–5 lines)
   - **Screenshots** (the uploaded image lines, each with a short caption)
   - **Decisions I made** (from step 1; omit if none)
   - **How to verify** / **Test plan** (what you ran, what passed)
4. Register it with T3: `link_pull_request` with the PR URL.
5. Post the PR link plus the same screenshots in chat for the user to review.

## 5. Autonomous CodeRabbit + CI loop

### How CodeRabbit works here

- The repo is public on CodeRabbit's **free OSS plan**. Review capacity is
  shared across the whole org and runs out often. When it does, CodeRabbit
  edits its summary comment to "**Review limit reached** … Next included
  review available in **N minutes**." The `CodeRabbit` check still reports
  `pass`, so a rate-limited review **does not block merging**.
- Every push to the PR triggers an incremental review that spends capacity.
  So **batch fixes**: address every open finding locally, run the gates, and
  push once. Never push one fix at a time.
- The limit notice lives in CodeRabbit's summary issue comment (edited in
  place, marked `rate limited by coderabbit.ai`), not in a review. Compare
  its `updated_at` with the latest CodeRabbit review's `submitted_at` and
  `commit_id` to tell whether your head is still unreviewed.
- Do not tick the "Autopilot" or "Fix CodeRabbit comments" checkboxes in its
  comments. You are the autopilot, and two fixers fight.

### The loop

1. **Handle what is already there.** For each unresolved thread decide
   **fix** or **decline** (criteria: `pr-babysitter` step 4). Also read the
   review *body*: some findings appear only there as "outside diff range" or
   "nitpick" sections.
2. **Push one batch**, then reply on each thread in one line ("Fixed in
   `abc1234`: …" or "Declining: …") and resolve the threads you fixed (ids from
   the PR's GraphQL `reviewThreads`):

   ```bash
   gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -F id=<thread-id>
   ```

   Leave declined threads open if CodeRabbit may push back; resolve them once
   it acknowledges. Do not `@coderabbitai` in replies unless you want an
   answer, because chats add noise.
3. **CI failures**: read the real log (`gh run view --job <id> --log-failed`),
   fix the root cause, and fold the fix into the next batch.
4. **Wait without spinning.** Call `watch_pull_request` and end your turn. T3
   wakes you on failed or passed checks, new comments or reviews, and
   conflicts. If `watch_pull_request` is not available, run a background
   `sleep 540 && gh pr checks <pr>` (Bash `run_in_background`) and continue
   when it exits.
5. **Review limit hit** (the limit notice is newer than the last review,
   and your head commit is unreviewed):
   - Parse N from "available in N minutes". Run a background
     `sleep $(( (N + 2) * 60 ))` so you wake when capacity returns. Keep
     working on anything else meanwhile (CI fixes, conflicts).
   - When it fires, comment `@coderabbitai review` **once**. If the reply is
     another limit notice, wait it out one more time. After two limit
     notices in a row, stop requesting. Report to the user that the review is
     pending capacity, and treat the PR as mergeable on the other criteria.
   - Never post repeated review requests; it just burns capacity.
6. **Conflicts**: `git fetch && git rebase origin/main`, re-run the gates,
   and force-push (`--force-with-lease`), which is fine on your own branch.
   Mention that you rebased.
7. Repeat until done.

### Done

All of these hold:

- Required checks green (`gh pr checks`).
- CodeRabbit has reviewed the head commit, or is limit-blocked as described
  in step 5 (say which).
- No unresolved review threads.
- `mergeable=MERGEABLE`, `mergeStateStatus` = `CLEAN` (or only
  `BLOCKED` on a required human approval).

Then send a short final report: PR link, screenshots again if the UI changed
after review, what CodeRabbit raised and how each was handled, anything
declined and why, and anything still waiting on a human. If the review loop
changed the UI, re-capture and update the PR body's Screenshots section.

## Rules

- Keep the user informed with one-line status updates at real transitions
  (PR opened, CI red → fixed in `sha`, review limit hit → resuming at ~HH:MM,
  mergeable). Do not narrate the polling.
- If a reviewer finding forces a product decision, step 1's rule applies:
  ask, and keep the rest moving.
- Never merge, never push to `main`, never touch prod or the trunk Convex
  deployment without the user saying so explicitly.

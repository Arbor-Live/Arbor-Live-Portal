---
name: pr-babysitter
description:
  Owns the full PR lifecycle after implementation is done: verify the work
  (lint, typecheck, unit, E2E, and a browser smoke test when browser control
  is available), open the PR, wait for CI and review, process reviewer-bot
  (CodeRabbit) comments, fix what is appropriate, and keep pushing until the
  PR is mergeable. Use when the user says "make the PR", "babysit the PR",
  "finish the PR", or asks you to see a change through to merge.
---

# PR Babysitter

Delivery loop: verified → PR open → CI green → reviews resolved → mergeable.
Do not stop halfway; do not merge unless the user said to.

## 1. Verify before opening

- Standard gates, all green: `pnpm lint && pnpm typecheck`, `pnpm test`
  (unit), and `pnpm test:e2e` for behavior changes.
- **Browser smoke test when browser control is available on the machine**
  (agent-harness tools for navigate/snapshot/click/type): start the dev
  servers (`pnpm dev:backend`, `pnpm dev:web`) and exercise the changed flow
  by hand in the browser:
  - Walk the happy path end to end; confirm the UI actually reflects the
    change — a green build proves nothing about what users see.
  - Check the browser console for new errors/warnings after interacting.
  - Resize to one narrow and one desktop viewport; check both color schemes
    if styling was touched.
  - Local Convex is ephemeral: expect to bootstrap (`/setup`, dev preview
    wizards) or seed state before anything is exercisable.
- If no browser tool exists on the machine, say so and rely on E2E. The smoke
  test supplements, never replaces, the standard gates.

## 2. Open the PR

- Inspect `git status`, `git diff`, `git log --oneline -10` first. Stage only
  intended files; never commit secrets or generated files.
- Concise commit message matching repo style.
- Push the branch, then `gh pr create` with a body written for the reviewer:
  what changed and why, how to verify, test plan.
- One PR = one logical change. If scope crept during implementation, split it.

## 3. Wait for CI

- Watch with `gh pr checks --watch`. This repo's E2E runs 4 shards, up to ~25
  minutes — wait, do not poll in a tight loop.
- On failure: read the actual logs (`gh run view --log-failed`), fix the root
  cause, push. Never blind re-run to "see if it passes". If a failure looks
  flaky, re-run once and say so; if it fails again, it is your bug.

## 4. Process reviews (CodeRabbit and humans)

- Read every comment: `gh pr view --comments` plus inline review threads
  (`gh api repos/{owner}/{repo}/pulls/{n}/comments`).
- For each comment, decide: **fix** or **decline with a one-line reason**.
  - Fix: correctness, conventions, naming, perf, test gaps — anything matching
    repo norms in AGENTS.md.
  - Decline: nitpicks that add noise, scope creep, suggestions contradicting
    repo rules (unsolicited helper text, speculative abstractions, unmeasured
    limits). Reply once, briefly, why. No sarcasm, no essays.
- Never silently ignore a comment. Fixed or answered, every thread resolves.
- Push fixes as new commits (amend only if the PR has no reviews yet).
- If the bot re-reviews after push, loop back to step 4 until it settles.

## 5. Babysit to mergeable

- After every push, return to step 3: CI re-runs, new comments may appear.
- Merge conflicts: `git fetch && git rebase origin/main`, resolve, push.
- Done when ALL of: CI green, all review threads resolved, no conflicts,
  branch up to date (`gh pr view --json mergeable,mergeStateStatus`).
- Report status changes concisely as they happen (CI red → fixed in <sha>;
  CodeRabbit comment addressed; rebased).
- Stop at mergeable unless the user explicitly asked you to merge.

## Rules

- Force-push only over your own unreviewed commits; say so when you do.
- If CI is red and the fix is non-obvious, surface the tradeoff to the user
  instead of choosing silently.
- While babysitting, keep the user posted but keep working — the loop runs
  until mergeable or blocked.

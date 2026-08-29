---
name: code-review
description:
  Reviewing PRs in this repo against its norms. Use when asked to review a
  PR, check someone's diff, or judge whether changes follow repo conventions.
---

# Code Review

Read `AGENTS.md` first — the checklist below is its enforcement pass. Review
the whole PR (`gh pr diff`, `gh pr view`), not just the latest push.

## Checklist

**Scope**
- One logical change per PR. Flag "while we're here" additions for a follow-up.
- New abstractions need a demonstrated constraint, not anticipated elegance.

**Limits and errors**
- Every cap / page size / timeout is measured or points at prior art in
  `docs/convex-efficiency.md`; provisional numbers carry a why-comment.
- No silent limits: failures name what failed, the limit, and the actual value
  (`max X, got Y`). No swallowed catches, blank failures, vague toasts.
- Validation happens early (Convex validators, typecheck), not deep at runtime.

**Convex**
- `convex/_generated/ai/guidelines.md` respected (it overrides trained habits).
- Query efficiency: session shell pattern, search-on-demand pickers, no stacked
  viewer queries — see `docs/convex-efficiency.md`.
- Schema changes additive-safe, or use widen–migrate–narrow
  (`convex-migration-helper` skill) with migration jobs appended, never
  reordered.

**UI**
- No new subtitles/helper text/descriptive copy under headings, labels, cards,
  settings unless the user asked for it.
- No timezone names (PT/PST) in the web app.
- No `window.confirm`/`alert`/`prompt` — `useAppDialog()`;
  `AdminCascadeDeleteDialog` for admin cascade deletes.

**Tests and hygiene**
- Behavior changes have E2E coverage (`docs/e2e-coverage.md` names the file).
- `pnpm lint && pnpm typecheck` pass; `pnpm --filter web build` for
  cross-file/route typing.
- No secrets, no generated files committed.
- Show-file code (`packages/show-file/`): fixture still matches
  `templates/scopes-reference.json`.

## Verdict style

Comment on what to change and why in one line each; approve when only nitpicks
remain. Do not invent requirements AGENTS.md doesn't have.

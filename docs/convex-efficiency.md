# Convex & dashboard query efficiency

Guidance for agents and humans changing portal queries or dashboard data loading.
Prefer these patterns over stacking eager list subscriptions.

## Goals

1. **Bound every read** — never `.collect()` on growing tables; use `.take(n)`, indexes, pagination, or search.
2. **Load on demand** — large catalogs (inventory types/packages, venues) use type-to-search, not full preload.
3. **One shell subscription** — dashboard auth/org/onboarding context comes from a single query shared via React context.
4. **Batch chrome counters** — sidebar badges are one query, not six independent subscriptions.

## Session shell (dashboard)

- Backend: `users.getSessionShell` returns `viewer`, `account`, `onboarding`, `activeOrganization`, and `organizations`.
- Frontend: `SessionShellProvider` wraps `apps/web/src/app/dashboard/layout.tsx`.
- Prefer `useSessionShell()` / `useSessionViewer()` inside the dashboard instead of `users.getViewer`, `getActiveOrganization`, or `listMyOrganizations`.
- Keep `getViewer` / org queries for non-dashboard surfaces (public pages, guest flows) where the provider is absent.

## Nav badges

- Use `navBadges.getNavBadges` from the sidebar (gated off heavy event-editor routes).
- Do not reintroduce per-badge `useQuery` stacks on every page for pending counts.

## Search-on-demand pickers

Use for large, growing catalogs:

| Domain | Search + hydrate |
|---|---|
| Inventory types | `inventoryTypes.searchOptions` + `getOptionsByIds` → `InventoryTypeSearchSelect` |
| Inventory packages | `inventoryPackages.searchOptions` + `getOptionsByIds` → `InventoryPackageSearchSelect` |
| Venues | `venues.searchOptions` + `getOptionsByIds` → `VenuePicker` |

Conventions:

- Min query length (usually 2 chars) + debounce before searching.
- Hydrate selected IDs with `getOptionsByIds` so labels survive without a full catalog.
- Do **not** convert small fixed lists (managers, categories, capabilities, storage locations) to type-to-search.

## List / fan-out queries

- `events.listForDashboard` deliberately uses tight per-event takes and skips series occurrence scans when `occurrenceCount` is set. Do not widen takes without measuring.
- Prefer slim summaries (`pullListSummary`, `scheduleSummary`, `assignedCrew`) over shipping full child docs to list UIs.
- Detail pages (`events.get` with `detail: "schedule" | "full"`) should load enrichment only for the active tab.

## Auth stacking

Avoid N independent auth-resolved queries that each call `requireAuth` + org resolution for the same chrome. Fold related “always needed” fields into `getSessionShell` or a single feature query instead.

## When adding a new dashboard subscription

Ask:

1. Is this already on the shell or another shared subscription?
2. Can it be skipped until the user opens a tab/modal/focuses a field?
3. Is the table large enough that search + `getByIds` beats a bounded list?
4. Are all `.take()` limits intentional and documented?

## Related docs / skills

- Architecture overview: `docs/architecture.md`
- App context skill: `.cursor/skills/arbor-live-portal-app-context/SKILL.md`
- Convex API rules: `packages/backend/convex/_generated/ai/guidelines.md`

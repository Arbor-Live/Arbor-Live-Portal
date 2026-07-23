import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@/lib/convex-api";

type DamageReport = FunctionReturnType<typeof api.damageReports.list>[number];
type DamageStatus = DamageReport["status"];

const LIST_STATUS_ARGS: Array<{ status?: DamageStatus }> = [
  { status: "open" },
  { status: "in_progress" },
  { status: "resolved" },
  {},
];

function isPendingStatus(status: DamageStatus) {
  return status === "open" || status === "in_progress";
}

function matchesListFilter(reportStatus: DamageStatus, args: { status?: DamageStatus }) {
  if (!args.status) return true;
  return reportStatus === args.status;
}

function findReportInLoadedLists(
  localStore: OptimisticLocalStore,
  reportId: Id<"damageReports">,
): DamageReport | null {
  for (const entry of localStore.getAllQueries(api.damageReports.list)) {
    if (!entry.value) continue;
    const found = entry.value.find((row) => row._id === reportId);
    if (found) return found;
  }
  return null;
}

function patchLoadedLists(
  localStore: OptimisticLocalStore,
  reportId: Id<"damageReports">,
  nextStatus: DamageStatus,
  resolvedAt?: number,
) {
  const now = Date.now();
  const existing = findReportInLoadedLists(localStore, reportId);
  if (!existing) return null;

  const updated: DamageReport = {
    ...existing,
    status: nextStatus,
    updatedAt: now,
    resolvedAt: nextStatus === "resolved" ? (resolvedAt ?? now) : undefined,
  };

  // Patch known arg shapes plus any other currently loaded list queries.
  const seen = new Set<string>();
  const candidates = [
    ...LIST_STATUS_ARGS.map((args) => ({ args })),
    ...localStore.getAllQueries(api.damageReports.list).map((entry) => ({ args: entry.args })),
  ];

  for (const candidate of candidates) {
    const key = JSON.stringify(candidate.args);
    if (seen.has(key)) continue;
    seen.add(key);

    const current = localStore.getQuery(api.damageReports.list, candidate.args);
    if (current === undefined) continue;

    const without = current.filter((row) => row._id !== reportId);
    if (matchesListFilter(nextStatus, candidate.args)) {
      localStore.setQuery(api.damageReports.list, candidate.args, [updated, ...without]);
    } else {
      localStore.setQuery(api.damageReports.list, candidate.args, without);
    }
  }

  return { previous: existing, updated };
}

function adjustPendingCount(
  localStore: OptimisticLocalStore,
  previousStatus: DamageStatus,
  nextStatus: DamageStatus,
) {
  const wasPending = isPendingStatus(previousStatus);
  const isPending = isPendingStatus(nextStatus);
  if (wasPending === isPending) return;

  const current = localStore.getQuery(api.damageReports.countPending, {});
  if (current === undefined) return;

  const delta = wasPending && !isPending ? -1 : !wasPending && isPending ? 1 : 0;
  localStore.setQuery(api.damageReports.countPending, {}, Math.max(0, current + delta));
}

export function optimisticUpdateDamageStatus(
  localStore: OptimisticLocalStore,
  args: { reportId: Id<"damageReports">; status: DamageStatus },
) {
  const result = patchLoadedLists(localStore, args.reportId, args.status);
  if (!result) return;
  adjustPendingCount(localStore, result.previous.status, args.status);
}

export function optimisticDecommissionDamageReport(
  localStore: OptimisticLocalStore,
  args: { reportId: Id<"damageReports"> },
) {
  const result = patchLoadedLists(localStore, args.reportId, "resolved");
  if (!result) return;
  adjustPendingCount(localStore, result.previous.status, "resolved");
}

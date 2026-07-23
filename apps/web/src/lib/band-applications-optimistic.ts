import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@/lib/convex-api";

type Application = FunctionReturnType<typeof api.bandApplications.listAdmin>[number];
type ApplicationStatus = Application["status"];

const LIST_STATUS_ARGS: Array<{ status?: ApplicationStatus }> = [
  { status: "submitted" },
  { status: "approved" },
  { status: "declined" },
  {},
];

function matchesListFilter(status: ApplicationStatus, args: { status?: ApplicationStatus }) {
  if (!args.status) return true;
  return status === args.status;
}

function findApplication(
  localStore: OptimisticLocalStore,
  applicationId: Id<"bandApplications">,
): Application | null {
  for (const entry of localStore.getAllQueries(api.bandApplications.listAdmin)) {
    if (!entry.value) continue;
    const found = entry.value.find((row) => row._id === applicationId);
    if (found) return found;
  }
  return null;
}

export function optimisticDeclineBandApplication(
  localStore: OptimisticLocalStore,
  args: { applicationId: Id<"bandApplications">; declineReason?: string },
) {
  const existing = findApplication(localStore, args.applicationId);
  if (!existing || existing.status !== "submitted") return;

  const now = Date.now();
  const updated: Application = {
    ...existing,
    status: "declined",
    reviewedAt: now,
    declineReason: args.declineReason?.trim() || undefined,
  };

  const seen = new Set<string>();
  const candidates = [
    ...LIST_STATUS_ARGS.map((listArgs) => ({ args: listArgs })),
    ...localStore.getAllQueries(api.bandApplications.listAdmin).map((entry) => ({
      args: entry.args,
    })),
  ];

  for (const candidate of candidates) {
    const key = JSON.stringify(candidate.args);
    if (seen.has(key)) continue;
    seen.add(key);

    const current = localStore.getQuery(api.bandApplications.listAdmin, candidate.args);
    if (current === undefined) continue;

    const without = current.filter((row) => row._id !== args.applicationId);
    if (matchesListFilter("declined", candidate.args)) {
      localStore.setQuery(api.bandApplications.listAdmin, candidate.args, [updated, ...without]);
    } else {
      localStore.setQuery(api.bandApplications.listAdmin, candidate.args, without);
    }
  }

  const pending = localStore.getQuery(api.bandApplications.countPendingSubmitted, {});
  if (pending !== undefined) {
    localStore.setQuery(
      api.bandApplications.countPendingSubmitted,
      {},
      Math.max(0, pending - 1),
    );
  }
}

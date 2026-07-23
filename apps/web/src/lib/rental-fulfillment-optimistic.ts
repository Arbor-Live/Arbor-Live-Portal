import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@/lib/convex-api";

type OutboundWorkspace = NonNullable<
  FunctionReturnType<typeof api.eventRentalFulfillment.getOutboundWorkspace>
>;
type ReturnWorkspace = NonNullable<
  FunctionReturnType<typeof api.eventRentalFulfillment.getReturnWorkspace>
>;
type OutboundUnit = OutboundWorkspace["units"][number];
type NeedSummary = OutboundWorkspace["needs"][number];

function recomputeNeeds(needs: NeedSummary[], units: OutboundUnit[]): NeedSummary[] {
  return needs.map((need) => {
    const matching = units.filter(
      (unit) =>
        unit.pullListItemId === need.pullListItemId &&
        unit.typeId === need.typeId &&
        unit.outboundStatus !== "removed",
    );
    const fulfilled = matching.filter((unit) => unit.outboundStatus !== "pending").length;
    return {
      ...need,
      quantityFulfilled: Math.min(need.quantityRequired, fulfilled),
      quantityPending: Math.max(0, need.quantityRequired - fulfilled),
    };
  });
}

function patchOutboundWorkspace(
  localStore: OptimisticLocalStore,
  eventId: Id<"events">,
  updater: (current: OutboundWorkspace) => OutboundWorkspace,
) {
  const current = localStore.getQuery(api.eventRentalFulfillment.getOutboundWorkspace, {
    eventId,
  });
  if (!current) return;
  localStore.setQuery(api.eventRentalFulfillment.getOutboundWorkspace, { eventId }, updater(current));
}

function patchReturnWorkspace(
  localStore: OptimisticLocalStore,
  eventId: Id<"events">,
  updater: (current: ReturnWorkspace) => ReturnWorkspace,
) {
  const current = localStore.getQuery(api.eventRentalFulfillment.getReturnWorkspace, {
    eventId,
  });
  if (!current) return;
  localStore.setQuery(api.eventRentalFulfillment.getReturnWorkspace, { eventId }, updater(current));
}

function findOutboundEventIdForUnit(
  localStore: OptimisticLocalStore,
  unitId: Id<"eventRentalUnits">,
): Id<"events"> | null {
  for (const entry of localStore.getAllQueries(api.eventRentalFulfillment.getOutboundWorkspace)) {
    if (!entry.value) continue;
    if (entry.value.units.some((unit) => unit._id === unitId)) {
      return entry.args.eventId;
    }
  }
  return null;
}

function findReturnEventIdForUnit(
  localStore: OptimisticLocalStore,
  unitId: Id<"eventRentalUnits">,
): Id<"events"> | null {
  for (const entry of localStore.getAllQueries(api.eventRentalFulfillment.getReturnWorkspace)) {
    if (!entry.value) continue;
    if (entry.value.units.some((unit) => unit._id === unitId)) {
      return entry.args.eventId;
    }
  }
  return null;
}

export function optimisticSetOutboundDisposition(
  localStore: OptimisticLocalStore,
  args: {
    unitId: Id<"eventRentalUnits">;
    status: "replace" | "no_tag" | "removed";
  },
) {
  const eventId = findOutboundEventIdForUnit(localStore, args.unitId);
  if (!eventId) return;

  patchOutboundWorkspace(localStore, eventId, (current) => {
    const now = Date.now();
    const units = current.units.map((unit) => {
      if (unit._id !== args.unitId) return unit;
      const next: OutboundUnit = {
        ...unit,
        outboundStatus: args.status,
        updatedAt: now,
      };
      if (args.status === "no_tag" || args.status === "replace") {
        delete next.inventoryItemId;
        delete next.assetId;
      }
      return next;
    });
    return {
      ...current,
      units,
      pendingCount: units.filter((unit) => unit.outboundStatus === "pending").length,
      needs: recomputeNeeds(current.needs, units),
    };
  });
}

export function optimisticSetReturnDisposition(
  localStore: OptimisticLocalStore,
  args: {
    unitId: Id<"eventRentalUnits">;
    status: "no_tag" | "missing" | "damaged" | "manual";
    damageReportId?: Id<"damageReports">;
  },
) {
  const eventId = findReturnEventIdForUnit(localStore, args.unitId);
  if (!eventId) return;

  patchReturnWorkspace(localStore, eventId, (current) => {
    const now = Date.now();
    const units = current.units.map((unit) => {
      if (unit._id !== args.unitId) return unit;
      return {
        ...unit,
        returnStatus: args.status,
        damageReportId: args.damageReportId ?? unit.damageReportId,
        updatedAt: now,
      };
    });
    return {
      ...current,
      units,
      pendingCount: units.filter((unit) => (unit.returnStatus ?? "pending") === "pending")
        .length,
    };
  });
}

export function optimisticUndoOutboundUnit(
  localStore: OptimisticLocalStore,
  args: { unitId: Id<"eventRentalUnits"> },
) {
  const eventId = findOutboundEventIdForUnit(localStore, args.unitId);
  if (!eventId) return;

  patchOutboundWorkspace(localStore, eventId, (current) => {
    const target = current.units.find((unit) => unit._id === args.unitId);
    if (!target || target.outboundStatus === "pending") return current;

    const now = Date.now();
    const units = !target.pullListItemId
      ? current.units.filter((unit) => unit._id !== args.unitId)
      : current.units.map((unit) => {
          if (unit._id !== args.unitId) return unit;
          const next: OutboundUnit = {
            ...unit,
            outboundStatus: "pending",
            updatedAt: now,
          };
          delete next.inventoryItemId;
          delete next.assetId;
          return next;
        });

    return {
      ...current,
      units,
      pendingCount: units.filter((unit) => unit.outboundStatus === "pending").length,
      needs: recomputeNeeds(current.needs, units),
    };
  });
}

export function optimisticUndoReturnUnit(
  localStore: OptimisticLocalStore,
  args: { unitId: Id<"eventRentalUnits"> },
) {
  const eventId = findReturnEventIdForUnit(localStore, args.unitId);
  if (!eventId) return;

  patchReturnWorkspace(localStore, eventId, (current) => {
    const now = Date.now();
    const units = current.units.map((unit) => {
      if (unit._id !== args.unitId) return unit;
      if ((unit.returnStatus ?? "pending") === "pending") return unit;
      const next = {
        ...unit,
        returnStatus: "pending" as const,
        updatedAt: now,
      };
      delete next.damageReportId;
      return next;
    });
    return {
      ...current,
      units,
      pendingCount: units.filter((unit) => (unit.returnStatus ?? "pending") === "pending")
        .length,
    };
  });
}

export function optimisticCompleteOutbound(
  localStore: OptimisticLocalStore,
  args: { eventId: Id<"events"> },
) {
  patchOutboundWorkspace(localStore, args.eventId, (current) => {
    const rented = current.units.filter(
      (unit) =>
        unit.outboundStatus === "scanned" ||
        unit.outboundStatus === "replace" ||
        unit.outboundStatus === "no_tag",
    );
    localStore.setQuery(
      api.eventRentalFulfillment.listRentedEquipment,
      { eventId: args.eventId },
      rented,
    );

    return {
      ...current,
      status: "completed",
      pendingCount: 0,
    };
  });

  const summary = localStore.getQuery(api.eventRentalFulfillment.getFulfillmentSummary, {
    eventId: args.eventId,
  });
  if (summary) {
    localStore.setQuery(
      api.eventRentalFulfillment.getFulfillmentSummary,
      { eventId: args.eventId },
      {
        ...summary,
        outboundInProgress: false,
        outboundCompleted: true,
      },
    );
  }
}

export function optimisticCompleteReturn(
  localStore: OptimisticLocalStore,
  args: { eventId: Id<"events"> },
) {
  patchReturnWorkspace(localStore, args.eventId, (current) => ({
    ...current,
    status: "completed",
    pendingCount: 0,
  }));

  const summary = localStore.getQuery(api.eventRentalFulfillment.getFulfillmentSummary, {
    eventId: args.eventId,
  });
  if (summary) {
    localStore.setQuery(
      api.eventRentalFulfillment.getFulfillmentSummary,
      { eventId: args.eventId },
      {
        ...summary,
        returnInProgress: false,
        returnCompleted: true,
      },
    );
  }
}

export function optimisticResendOutboundEmail(
  localStore: OptimisticLocalStore,
  args: { eventId: Id<"events"> },
) {
  patchOutboundWorkspace(localStore, args.eventId, (current) => {
    if (!current.clientNotify.canNotify) return current;
    return { ...current, clientEmailAlreadyQueued: true };
  });
}

export function optimisticResendReturnEmail(
  localStore: OptimisticLocalStore,
  args: { eventId: Id<"events"> },
) {
  patchReturnWorkspace(localStore, args.eventId, (current) => {
    if (!current.clientNotify.canNotify) return current;
    return { ...current, clientEmailAlreadyQueued: true };
  });
}

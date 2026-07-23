import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getUserId,
  requireArborInternalContext,
  requireAuth,
} from "./lib/auth";
import {
  eventDashboardUrl,
  formatEventDateRange,
  subjectForTemplate,
} from "./email/constants";
import { enqueueEmail } from "./email/enqueue";
import {
  expandPullListNeeds,
  getActiveFulfillment,
  getClientEmailForEvent,
  getLatestCompletedOutbound,
  isActiveRentedOutbound,
  listItemWithDescendants,
  listUnitsForEvent,
  listUnitsForFulfillment,
  missingClientEmailWarning,
  formatScannedAssetLabel,
  requireEvent,
  resolveInventoryItemByScan,
  syncPullListProgressFromUnits,
  typeLabel,
  withContentsSuffix,
} from "./lib/rentalFulfillment";
import { normalizeAssetScanInput } from "./lib/assetScan";

const outboundStatusValue = v.union(
  v.literal("pending"),
  v.literal("scanned"),
  v.literal("replace"),
  v.literal("no_tag"),
  v.literal("removed"),
);

const returnStatusValue = v.union(
  v.literal("pending"),
  v.literal("scanned"),
  v.literal("no_tag"),
  v.literal("missing"),
  v.literal("damaged"),
  v.literal("manual"),
);

const clientNotifyValidator = v.object({
  email: v.union(v.string(), v.null()),
  name: v.optional(v.string()),
  canNotify: v.boolean(),
});

const unitValidator = v.object({
  _id: v.id("eventRentalUnits"),
  _creationTime: v.number(),
  eventId: v.id("events"),
  fulfillmentId: v.id("eventRentalFulfillments"),
  pullListItemId: v.optional(v.id("eventPullListItems")),
  inventoryItemId: v.optional(v.id("inventoryItems")),
  assetId: v.optional(v.string()),
  typeId: v.optional(v.id("inventoryTypes")),
  label: v.string(),
  outboundStatus: outboundStatusValue,
  returnStatus: v.optional(returnStatusValue),
  damageReportId: v.optional(v.id("damageReports")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const needSummaryValidator = v.object({
  pullListItemId: v.id("eventPullListItems"),
  typeId: v.id("inventoryTypes"),
  label: v.string(),
  quantityRequired: v.number(),
  quantityFulfilled: v.number(),
  quantityPending: v.number(),
});

async function requireCrew(ctx: Parameters<typeof requireAuth>[0]) {
  await requireAuth(ctx);
  await requireArborInternalContext(ctx);
}

async function ensurePendingUnitsForOutbound(
  ctx: MutationCtx,
  eventId: Id<"events">,
  fulfillmentId: Id<"eventRentalFulfillments">,
) {
  const existing = await listUnitsForFulfillment(ctx, fulfillmentId);
  if (existing.length > 0) return existing;

  const needs = await expandPullListNeeds(ctx, eventId);
  const now = Date.now();
  const created: Doc<"eventRentalUnits">[] = [];
  for (const need of needs) {
    for (let i = 0; i < need.quantity; i += 1) {
      const id = await ctx.db.insert("eventRentalUnits", {
        eventId,
        fulfillmentId,
        pullListItemId: need.pullListItemId,
        typeId: need.typeId,
        label: need.label,
        outboundStatus: "pending",
        createdAt: now,
        updatedAt: now,
      });
      const row = await ctx.db.get(id);
      if (row) created.push(row);
    }
  }
  return created;
}

function summarizeNeeds(
  needs: Awaited<ReturnType<typeof expandPullListNeeds>>,
  units: Doc<"eventRentalUnits">[],
) {
  return needs.map((need) => {
    const matching = units.filter(
      (unit) =>
        unit.pullListItemId === need.pullListItemId &&
        unit.typeId === need.typeId &&
        unit.outboundStatus !== "removed",
    );
    const fulfilled = matching.filter((unit) => unit.outboundStatus !== "pending").length;
    return {
      pullListItemId: need.pullListItemId,
      typeId: need.typeId,
      label: need.label,
      quantityRequired: need.quantity,
      quantityFulfilled: Math.min(need.quantity, fulfilled),
      quantityPending: Math.max(0, need.quantity - fulfilled),
    };
  });
}

async function clientNotifyForEvent(ctx: Parameters<typeof requireAuth>[0], event: Doc<"events">) {
  const client = await getClientEmailForEvent(ctx, event);
  return {
    email: client?.email ?? null,
    name: client?.name,
    canNotify: Boolean(client?.email),
  };
}

async function enqueueOutboundPackedEmail(
  ctx: MutationCtx,
  event: Doc<"events">,
  fulfillment: Doc<"eventRentalFulfillments">,
  units: Doc<"eventRentalUnits">[],
  opts?: { forceResend?: boolean },
) {
  const client = await getClientEmailForEvent(ctx, event);
  if (!client) {
    return {
      emailSent: false as const,
      emailWarning: missingClientEmailWarning("outbound"),
    };
  }

  const rented = units.filter((unit) => isActiveRentedOutbound(unit.outboundStatus));
  const mode = event.rentalFulfillmentMode === "will_call" ? "will_call" : "delivery";
  const summaryLines = rented.map((unit) =>
    unit.assetId ? `${unit.label} (${unit.assetId})` : `${unit.label} (no tag)`,
  );
  const baseKey = `rental_outbound_packed:${fulfillment._id}`;
  await enqueueEmail(ctx, {
    template: "rental_outbound_packed",
    to: client.email,
    subject: subjectForTemplate("rental_outbound_packed", event.title),
    eventId: event._id,
    idempotencyKey: opts?.forceResend ? `${baseKey}:resend:${Date.now()}` : baseKey,
    payload: {
      recipientName: client.name,
      eventTitle: event.title,
      venueName: event.venueName,
      dateRangeLabel: formatEventDateRange(event.startAt, event.endAt, event.timezone),
      fulfillmentMode: mode,
      itemSummaries: summaryLines,
      eventUrl: eventDashboardUrl(event._id),
    },
  });

  return { emailSent: true as const, emailWarning: undefined };
}

async function enqueueReturnProcessedEmail(
  ctx: MutationCtx,
  event: Doc<"events">,
  returnSession: Doc<"eventRentalFulfillments">,
  units: Doc<"eventRentalUnits">[],
  opts?: { forceResend?: boolean },
) {
  const client = await getClientEmailForEvent(ctx, event);
  if (!client) {
    return {
      emailSent: false as const,
      emailWarning: missingClientEmailWarning("return"),
    };
  }

  const exceptions = units.filter(
    (unit) => unit.returnStatus === "missing" || unit.returnStatus === "damaged",
  );
  const baseKey = `rental_return_processed:${returnSession._id}`;
  await enqueueEmail(ctx, {
    template: "rental_return_processed",
    to: client.email,
    subject: subjectForTemplate("rental_return_processed", event.title),
    eventId: event._id,
    idempotencyKey: opts?.forceResend ? `${baseKey}:resend:${Date.now()}` : baseKey,
    payload: {
      recipientName: client.name,
      eventTitle: event.title,
      venueName: event.venueName,
      dateRangeLabel: formatEventDateRange(event.startAt, event.endAt, event.timezone),
      exceptionItems: exceptions.map((unit) => ({
        label: unit.label,
        assetId: unit.assetId,
        status: unit.returnStatus === "damaged" ? "damaged" : "missing",
      })),
      eventUrl: eventDashboardUrl(event._id),
    },
  });

  return { emailSent: true as const, emailWarning: undefined };
}

export const resolveAssetScan = query({
  args: { raw: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      inventoryItemId: v.id("inventoryItems"),
      assetId: v.string(),
      typeId: v.id("inventoryTypes"),
      label: v.string(),
      typeName: v.string(),
      hasChildren: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    const item = await resolveInventoryItemByScan(ctx, args.raw);
    if (!item) return null;
    const type = await ctx.db.get(item.typeId);
    const children = await ctx.db
      .query("inventoryItems")
      .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", item._id))
      .take(1);
    return {
      inventoryItemId: item._id,
      assetId: item.assetId,
      typeId: item.typeId,
      label: type?.name ?? item.assetId,
      typeName: type?.name ?? item.assetId,
      hasChildren: children.length > 0,
    };
  },
});

export const getFulfillmentSummary = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    outboundInProgress: v.boolean(),
    outboundCompleted: v.boolean(),
    returnInProgress: v.boolean(),
    returnCompleted: v.boolean(),
    activeRentedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    await requireEvent(ctx, args.eventId);
    const outboundActive = await getActiveFulfillment(ctx, args.eventId, "outbound");
    const outboundDone = await getLatestCompletedOutbound(ctx, args.eventId);
    const returnActive = await getActiveFulfillment(ctx, args.eventId, "return");
    const returnRows = await ctx.db
      .query("eventRentalFulfillments")
      .withIndex("by_eventId_and_direction", (q) =>
        q.eq("eventId", args.eventId).eq("direction", "return"),
      )
      .take(20);
    const returnCompleted = returnRows.some((row) => row.status === "completed");
    const units = await listUnitsForEvent(ctx, args.eventId);
    const activeRentedCount = units.filter((unit) =>
      isActiveRentedOutbound(unit.outboundStatus),
    ).length;
    return {
      outboundInProgress: Boolean(outboundActive),
      outboundCompleted: Boolean(outboundDone),
      returnInProgress: Boolean(returnActive),
      returnCompleted,
      activeRentedCount,
    };
  },
});

export const getOutboundWorkspace = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({
      fulfillmentId: v.id("eventRentalFulfillments"),
      status: v.union(v.literal("in_progress"), v.literal("completed")),
      units: v.array(unitValidator),
      needs: v.array(needSummaryValidator),
      pendingCount: v.number(),
      clientNotify: clientNotifyValidator,
      clientEmailAlreadyQueued: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    const event = await requireEvent(ctx, args.eventId);
    const active = await getActiveFulfillment(ctx, args.eventId, "outbound");
    const completed = active ? null : await getLatestCompletedOutbound(ctx, args.eventId);
    const fulfillment = active ?? completed;
    if (!fulfillment) return null;
    const units = await listUnitsForFulfillment(ctx, fulfillment._id);
    const needs = summarizeNeeds(await expandPullListNeeds(ctx, args.eventId), units);
    const existingEmail = await ctx.db
      .query("emailNotifications")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", `rental_outbound_packed:${fulfillment._id}`),
      )
      .unique();
    return {
      fulfillmentId: fulfillment._id,
      status: fulfillment.status,
      units,
      needs,
      pendingCount: units.filter((unit) => unit.outboundStatus === "pending").length,
      clientNotify: await clientNotifyForEvent(ctx, event),
      clientEmailAlreadyQueued: Boolean(
        existingEmail && (existingEmail.status === "queued" || existingEmail.status === "sent"),
      ),
    };
  },
});

export const getReturnWorkspace = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({
      fulfillmentId: v.id("eventRentalFulfillments"),
      status: v.union(v.literal("in_progress"), v.literal("completed")),
      units: v.array(unitValidator),
      pendingCount: v.number(),
      clientNotify: clientNotifyValidator,
      clientEmailAlreadyQueued: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    const event = await requireEvent(ctx, args.eventId);
    const outbound = await getLatestCompletedOutbound(ctx, args.eventId);
    if (!outbound) return null;

    const rented = (await listUnitsForFulfillment(ctx, outbound._id)).filter((unit) =>
      isActiveRentedOutbound(unit.outboundStatus),
    );
    const returnActive = await getActiveFulfillment(ctx, args.eventId, "return");
    const returnRows = await ctx.db
      .query("eventRentalFulfillments")
      .withIndex("by_eventId_and_direction", (q) =>
        q.eq("eventId", args.eventId).eq("direction", "return"),
      )
      .take(20);
    const returnCompleted = returnRows.find((row) => row.status === "completed");
    const status = returnActive
      ? ("in_progress" as const)
      : returnCompleted
        ? ("completed" as const)
        : ("completed" as const);
    const fulfillmentId = returnActive?._id ?? returnCompleted?._id ?? outbound._id;
    const units = rented.map((unit) => ({
      ...unit,
      returnStatus: unit.returnStatus ?? ("pending" as const),
    }));
    const notifyFulfillmentId = returnActive?._id ?? returnCompleted?._id;
    const existingEmail = notifyFulfillmentId
      ? await ctx.db
          .query("emailNotifications")
          .withIndex("by_idempotencyKey", (q) =>
            q.eq("idempotencyKey", `rental_return_processed:${notifyFulfillmentId}`),
          )
          .unique()
      : null;
    return {
      fulfillmentId,
      status,
      units,
      pendingCount: units.filter((unit) => (unit.returnStatus ?? "pending") === "pending").length,
      clientNotify: await clientNotifyForEvent(ctx, event),
      clientEmailAlreadyQueued: Boolean(
        existingEmail && (existingEmail.status === "queued" || existingEmail.status === "sent"),
      ),
    };
  },
});

export const listRentedEquipment = query({
  args: { eventId: v.id("events") },
  returns: v.array(unitValidator),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    await requireEvent(ctx, args.eventId);
    const outbound = await getLatestCompletedOutbound(ctx, args.eventId);
    if (!outbound) return [];
    const units = await listUnitsForFulfillment(ctx, outbound._id);
    return units.filter((unit) => isActiveRentedOutbound(unit.outboundStatus));
  },
});

export const startOutbound = mutation({
  args: { eventId: v.id("events") },
  returns: v.object({ fulfillmentId: v.id("eventRentalFulfillments") }),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    await requireEvent(ctx, args.eventId);
    const existing = await getActiveFulfillment(ctx, args.eventId, "outbound");
    if (existing) {
      await ensurePendingUnitsForOutbound(ctx, args.eventId, existing._id);
      return { fulfillmentId: existing._id };
    }
    const completed = await getLatestCompletedOutbound(ctx, args.eventId);
    if (completed) {
      throw new Error("Outbound already completed for this event. Start a return instead.");
    }
    const fulfillmentId = await ctx.db.insert("eventRentalFulfillments", {
      eventId: args.eventId,
      direction: "outbound",
      status: "in_progress",
      startedAt: Date.now(),
    });
    await ensurePendingUnitsForOutbound(ctx, args.eventId, fulfillmentId);
    return { fulfillmentId };
  },
});

export const scanOutboundAsset = mutation({
  args: {
    eventId: v.id("events"),
    raw: v.string(),
  },
  returns: v.object({
    unitId: v.id("eventRentalUnits"),
    addedToRental: v.boolean(),
    assetId: v.string(),
    label: v.string(),
    checkedOffCount: v.number(),
    addedCount: v.number(),
    skippedAlreadyCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    const event = await requireEvent(ctx, args.eventId);
    const fulfillment = await getActiveFulfillment(ctx, args.eventId, "outbound");
    if (!fulfillment) throw new Error("Start outbound fulfillment first.");

    const root = await resolveInventoryItemByScan(ctx, args.raw);
    if (!root) {
      const normalized = normalizeAssetScanInput(args.raw);
      throw new Error(
        normalized
          ? `No inventory item matches “${normalized}”. Check the tag and try again.`
          : "Couldn’t read that scan. Try typing the asset tag (for example ALE-0041).",
      );
    }

    // Always expand packouts/containers: root + every nested contained asset.
    const bundle = await listItemWithDescendants(ctx, root._id);
    let units = await listUnitsForFulfillment(ctx, fulfillment._id);
    const now = Date.now();
    const scannedLabel = await formatScannedAssetLabel(ctx, root);
    const subject = withContentsSuffix(scannedLabel, bundle.length > 1);

    let primaryUnitId: Id<"eventRentalUnits"> | null = null;
    let checkedOffCount = 0;
    let addedCount = 0;
    let skippedAlreadyCount = 0;

    for (const item of bundle) {
      const already = units.find(
        (unit) =>
          unit.inventoryItemId === item._id &&
          unit.outboundStatus !== "removed" &&
          unit.outboundStatus !== "pending",
      );
      if (already) {
        skippedAlreadyCount += 1;
        if (!primaryUnitId) primaryUnitId = already._id;
        continue;
      }

      const pendingMatch =
        units.find(
          (unit) =>
            unit.outboundStatus === "pending" &&
            unit.typeId === item.typeId &&
            !unit.inventoryItemId,
        ) ??
        units.find(
          (unit) => unit.outboundStatus === "pending" && unit.typeId === item.typeId,
        );

      const label = await typeLabel(ctx, item.typeId, item.assetId);

      if (pendingMatch) {
        await ctx.db.patch(pendingMatch._id, {
          inventoryItemId: item._id,
          assetId: item.assetId,
          typeId: item.typeId,
          label,
          outboundStatus: "scanned",
          updatedAt: now,
        });
        checkedOffCount += 1;
        if (!primaryUnitId) primaryUnitId = pendingMatch._id;
        units = units.map((unit) =>
          unit._id === pendingMatch._id
            ? {
                ...unit,
                inventoryItemId: item._id,
                assetId: item.assetId,
                typeId: item.typeId,
                label,
                outboundStatus: "scanned" as const,
                updatedAt: now,
              }
            : unit,
        );
        continue;
      }

      const unitId = await ctx.db.insert("eventRentalUnits", {
        eventId: event._id,
        fulfillmentId: fulfillment._id,
        inventoryItemId: item._id,
        assetId: item.assetId,
        typeId: item.typeId,
        label,
        outboundStatus: "scanned",
        createdAt: now,
        updatedAt: now,
      });
      addedCount += 1;
      if (!primaryUnitId) primaryUnitId = unitId;
      const created = await ctx.db.get(unitId);
      if (created) units = [...units, created];
    }

    if (!primaryUnitId || checkedOffCount + addedCount === 0) {
      throw new Error(
        skippedAlreadyCount > 0
          ? `${subject} ${bundle.length > 1 ? "are" : "is"} already packed.`
          : `Couldn’t pack ${subject}. Try scanning again.`,
      );
    }

    await syncPullListProgressFromUnits(ctx, args.eventId, units);

    const rootLabel = await typeLabel(ctx, root.typeId, root.assetId);
    return {
      unitId: primaryUnitId,
      addedToRental: addedCount > 0 && checkedOffCount === 0,
      assetId: root.assetId,
      label: rootLabel,
      checkedOffCount,
      addedCount,
      skippedAlreadyCount,
    };
  },
});

export const setOutboundDisposition = mutation({
  args: {
    unitId: v.id("eventRentalUnits"),
    status: v.union(v.literal("replace"), v.literal("no_tag"), v.literal("removed")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    const unit = await ctx.db.get(args.unitId);
    if (!unit) throw new Error("Rental unit not found.");
    const fulfillment = await ctx.db.get(unit.fulfillmentId);
    if (!fulfillment || fulfillment.direction !== "outbound" || fulfillment.status !== "in_progress") {
      throw new Error("Outbound fulfillment is not in progress.");
    }
    if (unit.outboundStatus !== "pending" && unit.outboundStatus !== args.status) {
      if (unit.outboundStatus === "scanned") {
        throw new Error("Scanned units cannot be reassigned with a disposition.");
      }
    }
    const now = Date.now();
    await ctx.db.patch(unit._id, {
      outboundStatus: args.status,
      inventoryItemId: args.status === "no_tag" || args.status === "replace" ? undefined : unit.inventoryItemId,
      assetId: args.status === "no_tag" || args.status === "replace" ? undefined : unit.assetId,
      updatedAt: now,
    });
    await syncPullListProgressFromUnits(
      ctx,
      unit.eventId,
      await listUnitsForFulfillment(ctx, unit.fulfillmentId),
    );
    return null;
  },
});

/** Reset a scanned or dispositioned outbound unit back to pending (or delete extras added by scan). */
export const undoOutboundUnit = mutation({
  args: { unitId: v.id("eventRentalUnits") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    const unit = await ctx.db.get(args.unitId);
    if (!unit) throw new Error("Rental unit not found.");
    const fulfillment = await ctx.db.get(unit.fulfillmentId);
    if (!fulfillment || fulfillment.direction !== "outbound" || fulfillment.status !== "in_progress") {
      throw new Error("Outbound fulfillment is not in progress.");
    }
    if (unit.outboundStatus === "pending") {
      return null;
    }

    // Extra units created by scanning assets not on the pull list: remove them entirely.
    if (!unit.pullListItemId) {
      await ctx.db.delete(unit._id);
      await syncPullListProgressFromUnits(
        ctx,
        unit.eventId,
        await listUnitsForFulfillment(ctx, unit.fulfillmentId),
      );
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(unit._id, {
      outboundStatus: "pending",
      inventoryItemId: undefined,
      assetId: undefined,
      updatedAt: now,
    });
    await syncPullListProgressFromUnits(
      ctx,
      unit.eventId,
      await listUnitsForFulfillment(ctx, unit.fulfillmentId),
    );
    return null;
  },
});

export const completeOutbound = mutation({
  args: { eventId: v.id("events") },
  returns: v.object({
    emailSent: v.boolean(),
    emailWarning: v.optional(v.string()),
    rentedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const event = await requireEvent(ctx, args.eventId);
    const fulfillment = await getActiveFulfillment(ctx, args.eventId, "outbound");
    if (!fulfillment) throw new Error("No outbound fulfillment in progress.");

    const units = await listUnitsForFulfillment(ctx, fulfillment._id);
    const pending = units.filter((unit) => unit.outboundStatus === "pending");
    if (pending.length > 0) {
      throw new Error(
        `Resolve ${pending.length} unchecked item${pending.length === 1 ? "" : "s"} with replace, no tag, or removed before completing.`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(fulfillment._id, {
      status: "completed",
      completedAt: now,
      completedByUserId: getUserId(user),
    });
    await syncPullListProgressFromUnits(ctx, args.eventId, units);

    const rented = units.filter((unit) => isActiveRentedOutbound(unit.outboundStatus));
    const emailResult = await enqueueOutboundPackedEmail(ctx, event, fulfillment, units);
    return {
      emailSent: emailResult.emailSent,
      emailWarning: emailResult.emailSent
        ? undefined
        : `Delivery completed, but the client was not emailed. ${emailResult.emailWarning ?? ""}`.trim(),
      rentedCount: rented.length,
    };
  },
});

export const resendOutboundClientEmail = mutation({
  args: { eventId: v.id("events") },
  returns: v.object({
    emailSent: v.boolean(),
    emailWarning: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    const event = await requireEvent(ctx, args.eventId);
    const fulfillment = await getLatestCompletedOutbound(ctx, args.eventId);
    if (!fulfillment) throw new Error("No completed outbound to notify for.");
    const units = await listUnitsForFulfillment(ctx, fulfillment._id);
    return await enqueueOutboundPackedEmail(ctx, event, fulfillment, units, {
      forceResend: true,
    });
  },
});

export const startReturn = mutation({
  args: { eventId: v.id("events") },
  returns: v.object({ fulfillmentId: v.id("eventRentalFulfillments") }),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    await requireEvent(ctx, args.eventId);
    const existing = await getActiveFulfillment(ctx, args.eventId, "return");
    if (existing) return { fulfillmentId: existing._id };

    const returnRows = await ctx.db
      .query("eventRentalFulfillments")
      .withIndex("by_eventId_and_direction", (q) =>
        q.eq("eventId", args.eventId).eq("direction", "return"),
      )
      .take(20);
    if (returnRows.some((row) => row.status === "completed")) {
      throw new Error("Return already completed for this event.");
    }

    const outbound = await getLatestCompletedOutbound(ctx, args.eventId);
    if (!outbound) throw new Error("Complete outbound delivery before starting a return.");

    const rented = (await listUnitsForFulfillment(ctx, outbound._id)).filter((unit) =>
      isActiveRentedOutbound(unit.outboundStatus),
    );
    if (!rented.length) throw new Error("No rented equipment to return.");

    const fulfillmentId = await ctx.db.insert("eventRentalFulfillments", {
      eventId: args.eventId,
      direction: "return",
      status: "in_progress",
      startedAt: Date.now(),
    });

    const now = Date.now();
    for (const unit of rented) {
      // Keep return state on the outbound unit rows; link conceptually via event.
      await ctx.db.patch(unit._id, {
        returnStatus: unit.returnStatus ?? "pending",
        updatedAt: now,
      });
    }

    // Store return fulfillment id on a lightweight marker by copying unit refs is unnecessary;
    // workspace uses outbound units + active return session.
    return { fulfillmentId };
  },
});

export const scanReturnAsset = mutation({
  args: {
    eventId: v.id("events"),
    raw: v.string(),
  },
  returns: v.object({
    unitId: v.id("eventRentalUnits"),
    assetId: v.string(),
    label: v.string(),
    checkedInCount: v.number(),
    skippedAlreadyCount: v.number(),
    skippedNotOnListCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    await requireEvent(ctx, args.eventId);
    const returnSession = await getActiveFulfillment(ctx, args.eventId, "return");
    if (!returnSession) throw new Error("Start return fulfillment first.");

    const outbound = await getLatestCompletedOutbound(ctx, args.eventId);
    if (!outbound) throw new Error("No completed outbound found.");

    const root = await resolveInventoryItemByScan(ctx, args.raw);
    if (!root) {
      const normalized = normalizeAssetScanInput(args.raw);
      throw new Error(
        normalized
          ? `No inventory item matches “${normalized}”. Check the tag and try again.`
          : "Couldn’t read that scan. Try typing the asset tag (for example ALE-0041).",
      );
    }

    // Always expand packouts/containers: root + every nested contained asset.
    const bundle = await listItemWithDescendants(ctx, root._id);
    const units = (await listUnitsForFulfillment(ctx, outbound._id)).filter((unit) =>
      isActiveRentedOutbound(unit.outboundStatus),
    );
    const now = Date.now();
    const scannedLabel = await formatScannedAssetLabel(ctx, root);
    const subject = withContentsSuffix(scannedLabel, bundle.length > 1);

    let primaryUnitId: Id<"eventRentalUnits"> | null = null;
    let primaryLabel = root.assetId;
    let checkedInCount = 0;
    let skippedAlreadyCount = 0;
    let skippedNotOnListCount = 0;

    for (const item of bundle) {
      const match = units.find((unit) => unit.inventoryItemId === item._id);
      if (!match) {
        skippedNotOnListCount += 1;
        continue;
      }
      if ((match.returnStatus ?? "pending") !== "pending") {
        skippedAlreadyCount += 1;
        if (!primaryUnitId) {
          primaryUnitId = match._id;
          primaryLabel = match.label;
        }
        continue;
      }
      await ctx.db.patch(match._id, {
        returnStatus: "scanned",
        updatedAt: now,
      });
      checkedInCount += 1;
      if (!primaryUnitId) {
        primaryUnitId = match._id;
        primaryLabel = match.label;
      }
    }

    if (!primaryUnitId || checkedInCount === 0) {
      if (skippedAlreadyCount > 0) {
        throw new Error(
          bundle.length > 1
            ? `${subject} are already checked in.`
            : `${subject} is already checked in.`,
        );
      }
      if (skippedNotOnListCount > 0) {
        throw new Error(
          bundle.length > 1
            ? `${subject} aren’t on this return — they weren’t packed for this rental (or went out as “no tag”). Use Remaining to mark No tag / Missing instead of scanning.`
            : `${subject} isn’t on this return — it wasn’t packed for this rental (or went out as “no tag”). Use Remaining to mark No tag / Missing instead of scanning.`,
        );
      }
      throw new Error(`Couldn’t check in ${subject}. Try scanning again.`);
    }

    return {
      unitId: primaryUnitId,
      assetId: root.assetId,
      label: primaryLabel,
      checkedInCount,
      skippedAlreadyCount,
      skippedNotOnListCount,
    };
  },
});

export const setReturnDisposition = mutation({
  args: {
    unitId: v.id("eventRentalUnits"),
    status: v.union(
      v.literal("no_tag"),
      v.literal("missing"),
      v.literal("damaged"),
      v.literal("manual"),
    ),
    damageReportId: v.optional(v.id("damageReports")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    const unit = await ctx.db.get(args.unitId);
    if (!unit) throw new Error("Rental unit not found.");
    const returnSession = await getActiveFulfillment(ctx, unit.eventId, "return");
    if (!returnSession) throw new Error("Return fulfillment is not in progress.");
    if (!isActiveRentedOutbound(unit.outboundStatus)) {
      throw new Error("Unit is not part of the active rented set.");
    }
    if (args.status === "damaged" && !args.damageReportId) {
      throw new Error("Damaged disposition requires a damage report.");
    }
    await ctx.db.patch(unit._id, {
      returnStatus: args.status,
      damageReportId: args.damageReportId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Reset a checked-in or dispositioned return unit back to pending. */
export const undoReturnUnit = mutation({
  args: { unitId: v.id("eventRentalUnits") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    const unit = await ctx.db.get(args.unitId);
    if (!unit) throw new Error("Rental unit not found.");
    const returnSession = await getActiveFulfillment(ctx, unit.eventId, "return");
    if (!returnSession) throw new Error("Return fulfillment is not in progress.");
    if (!isActiveRentedOutbound(unit.outboundStatus)) {
      throw new Error("Unit is not part of the active rented set.");
    }
    if ((unit.returnStatus ?? "pending") === "pending") {
      return null;
    }
    await ctx.db.patch(unit._id, {
      returnStatus: "pending",
      damageReportId: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const completeReturn = mutation({
  args: { eventId: v.id("events") },
  returns: v.object({
    emailSent: v.boolean(),
    emailWarning: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const event = await requireEvent(ctx, args.eventId);
    const returnSession = await getActiveFulfillment(ctx, args.eventId, "return");
    if (!returnSession) throw new Error("No return fulfillment in progress.");

    const outbound = await getLatestCompletedOutbound(ctx, args.eventId);
    if (!outbound) throw new Error("No completed outbound found.");

    const units = (await listUnitsForFulfillment(ctx, outbound._id)).filter((unit) =>
      isActiveRentedOutbound(unit.outboundStatus),
    );
    const pending = units.filter((unit) => (unit.returnStatus ?? "pending") === "pending");
    if (pending.length > 0) {
      throw new Error(
        `Resolve ${pending.length} unchecked item${pending.length === 1 ? "" : "s"} before completing the return.`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(returnSession._id, {
      status: "completed",
      completedAt: now,
      completedByUserId: getUserId(user),
    });

    const emailResult = await enqueueReturnProcessedEmail(ctx, event, returnSession, units);
    return {
      emailSent: emailResult.emailSent,
      emailWarning: emailResult.emailSent
        ? undefined
        : `Return completed, but the client was not emailed. ${emailResult.emailWarning ?? ""}`.trim(),
    };
  },
});

export const resendReturnClientEmail = mutation({
  args: { eventId: v.id("events") },
  returns: v.object({
    emailSent: v.boolean(),
    emailWarning: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    const event = await requireEvent(ctx, args.eventId);
    const outbound = await getLatestCompletedOutbound(ctx, args.eventId);
    if (!outbound) throw new Error("No completed outbound found.");
    const returnRows = await ctx.db
      .query("eventRentalFulfillments")
      .withIndex("by_eventId_and_direction", (q) =>
        q.eq("eventId", args.eventId).eq("direction", "return"),
      )
      .take(20);
    const returnSession = returnRows.find((row) => row.status === "completed");
    if (!returnSession) throw new Error("No completed return to notify for.");
    const units = (await listUnitsForFulfillment(ctx, outbound._id)).filter((unit) =>
      isActiveRentedOutbound(unit.outboundStatus),
    );
    return await enqueueReturnProcessedEmail(ctx, event, returnSession, units, {
      forceResend: true,
    });
  },
});

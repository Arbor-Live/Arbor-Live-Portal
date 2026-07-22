import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  getUserId,
  requireAnyVerticalOrAdmin,
  requireArborInternalContext,
  requireAuth,
} from "./lib/auth";
import { formatStoredR2Asset } from "./lib/inventoryUpload";
import { resolveStoredR2AssetUrl } from "./inventoryR2";

const scopeValue = v.union(
  v.literal("this_only"),
  v.literal("all_including_children"),
  v.literal("children_only"),
  v.literal("some_children"),
);

const operabilityValue = v.union(v.literal("functional"), v.literal("needs_repair"));

const statusValue = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("resolved"),
);

const reportValidator = v.object({
  _id: v.id("damageReports"),
  inventoryItemId: v.id("inventoryItems"),
  assetId: v.string(),
  typeId: v.optional(v.id("inventoryTypes")),
  typeName: v.optional(v.string()),
  eventId: v.optional(v.id("events")),
  eventTitle: v.optional(v.string()),
  scope: scopeValue,
  scopedItemIds: v.array(v.id("inventoryItems")),
  operability: operabilityValue,
  severity: v.number(),
  notes: v.optional(v.string()),
  photoUrl: v.optional(v.string()),
  status: statusValue,
  reportedByUserId: v.string(),
  reportedAt: v.number(),
  updatedAt: v.number(),
  resolvedAt: v.optional(v.number()),
});

async function requireCrew(ctx: Parameters<typeof requireAuth>[0]) {
  await requireAuth(ctx);
  await requireArborInternalContext(ctx);
}

async function listChildren(
  ctx: Parameters<typeof requireAuth>[0],
  parentId: Id<"inventoryItems">,
) {
  return await ctx.db
    .query("inventoryItems")
    .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", parentId))
    .take(500);
}

function resolveScopedIds(args: {
  rootId: Id<"inventoryItems">;
  scope: "this_only" | "all_including_children" | "children_only" | "some_children";
  childIds: Id<"inventoryItems">[];
  someItemIds?: Id<"inventoryItems">[];
}): Id<"inventoryItems">[] {
  switch (args.scope) {
    case "this_only":
      return [args.rootId];
    case "all_including_children":
      return [args.rootId, ...args.childIds];
    case "children_only":
      return [...args.childIds];
    case "some_children": {
      const allowed = new Set(args.childIds);
      const selected = (args.someItemIds ?? []).filter((id) => allowed.has(id));
      if (!selected.length) {
        throw new Error("Select at least one item inside the container.");
      }
      return selected;
    }
  }
}

export const getItemChildren = query({
  args: { inventoryItemId: v.id("inventoryItems") },
  returns: v.array(
    v.object({
      inventoryItemId: v.id("inventoryItems"),
      assetId: v.string(),
      typeName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    const children = await listChildren(ctx, args.inventoryItemId);
    return Promise.all(
      children.map(async (child) => {
        const type = await ctx.db.get(child.typeId);
        return {
          inventoryItemId: child._id,
          assetId: child.assetId,
          typeName: type?.name ?? child.assetId,
        };
      }),
    );
  },
});

export const list = query({
  args: {
    status: v.optional(statusValue),
    eventId: v.optional(v.id("events")),
  },
  returns: v.array(reportValidator),
  handler: async (ctx, args) => {
    await requireCrew(ctx);
    let rows;
    if (args.eventId) {
      rows = await ctx.db
        .query("damageReports")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(500);
    } else if (args.status) {
      rows = await ctx.db
        .query("damageReports")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .take(500);
    } else {
      rows = await ctx.db.query("damageReports").order("desc").take(500);
    }

    const filtered = args.status
      ? rows.filter((row) => row.status === args.status)
      : rows;

    return Promise.all(
      filtered
        .sort((a, b) => b.reportedAt - a.reportedAt)
        .map(async (row) => {
          const type = row.typeId ? await ctx.db.get(row.typeId) : null;
          const event = row.eventId ? await ctx.db.get(row.eventId) : null;
          const photoUrl = row.photoR2Key
            ? await resolveStoredR2AssetUrl(formatStoredR2Asset(row.photoR2Key))
            : undefined;
          return {
            _id: row._id,
            inventoryItemId: row.inventoryItemId,
            assetId: row.assetId,
            typeId: row.typeId,
            typeName: type?.name,
            eventId: row.eventId,
            eventTitle: event?.title,
            scope: row.scope,
            scopedItemIds: row.scopedItemIds,
            operability: row.operability,
            severity: row.severity,
            notes: row.notes,
            photoUrl,
            status: row.status,
            reportedByUserId: row.reportedByUserId,
            reportedAt: row.reportedAt,
            updatedAt: row.updatedAt,
            resolvedAt: row.resolvedAt,
          };
        }),
    );
  },
});

export const create = mutation({
  args: {
    inventoryItemId: v.id("inventoryItems"),
    eventId: v.optional(v.id("events")),
    eventUnknown: v.boolean(),
    scope: scopeValue,
    someItemIds: v.optional(v.array(v.id("inventoryItems"))),
    operability: operabilityValue,
    severity: v.number(),
    notes: v.optional(v.string()),
    photoR2Key: v.optional(v.string()),
  },
  returns: v.object({
    reportIds: v.array(v.id("damageReports")),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);

    if (!Number.isFinite(args.severity) || args.severity < 1 || args.severity > 5) {
      throw new Error("Severity must be between 1 and 5.");
    }

    const root = await ctx.db.get(args.inventoryItemId);
    if (!root) throw new Error("Inventory item not found.");

    let eventId: Id<"events"> | undefined;
    if (!args.eventUnknown) {
      if (!args.eventId) throw new Error("Select an event or mark that you don’t know when it happened.");
      const event = await ctx.db.get(args.eventId);
      if (!event) throw new Error("Event not found.");
      eventId = event._id;
    }

    const children = await listChildren(ctx, root._id);
    if (
      (args.scope === "all_including_children" ||
        args.scope === "children_only" ||
        args.scope === "some_children") &&
      children.length === 0
    ) {
      throw new Error("This item has no contained assets.");
    }

    const scopedIds = resolveScopedIds({
      rootId: root._id,
      scope: args.scope,
      childIds: children.map((child) => child._id),
      someItemIds: args.someItemIds,
    });

    const now = Date.now();
    const photoKey = args.photoR2Key?.trim() || undefined;
    const reportIds: Id<"damageReports">[] = [];

    for (const itemId of scopedIds) {
      const item = await ctx.db.get(itemId);
      if (!item) continue;
      const reportId = await ctx.db.insert("damageReports", {
        inventoryItemId: item._id,
        assetId: item.assetId,
        typeId: item.typeId,
        eventId,
        scope: args.scope,
        scopedItemIds: scopedIds,
        operability: args.operability,
        severity: Math.floor(args.severity),
        notes: args.notes?.trim() || undefined,
        photoR2Key: photoKey,
        status: "open",
        reportedByUserId: getUserId(user),
        reportedAt: now,
        updatedAt: now,
      });
      reportIds.push(reportId);

      if (args.operability === "needs_repair") {
        await ctx.db.patch(item._id, {
          status: "needs_repair",
          updatedAt: now,
        });
      }
    }

    if (!reportIds.length) throw new Error("No damage reports were created.");
    return { reportIds };
  },
});

export const updateStatus = mutation({
  args: {
    reportId: v.id("damageReports"),
    status: statusValue,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnyVerticalOrAdmin(ctx, ["Operations"]);
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Damage report not found.");
    const now = Date.now();
    await ctx.db.patch(report._id, {
      status: args.status,
      updatedAt: now,
      resolvedAt: args.status === "resolved" ? now : undefined,
    });
    if (args.status === "resolved" && report.operability === "needs_repair") {
      const item = await ctx.db.get(report.inventoryItemId);
      if (item?.status === "needs_repair") {
        await ctx.db.patch(item._id, {
          status: "functional",
          updatedAt: now,
        });
      }
    }
    return null;
  },
});

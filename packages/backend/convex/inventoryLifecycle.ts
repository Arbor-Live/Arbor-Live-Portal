import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  findAuthUsersByIds,
  getUserId,
  requireAnyVerticalOrAdmin,
  requireArborInternalContext,
  requireAuth,
} from "./lib/auth";
import { canonicalizeAssetIdTag } from "./lib/assetScan";
import { appError, withReportableErrors } from "./lib/errors";
import {
  itemHistoryKindValue,
  lifecycleOf,
  recordItemHistory,
  refreshItemSearchText,
  retireItemRecord,
  retirementReasonValue,
} from "./lib/inventoryLifecycle";
import { listItemWithDescendants } from "./lib/rentalFulfillment";

/** Retiring, reinstating and relabeling gear is Operations' call, like decommissioning from a damage report. */
async function requireInventoryManager(ctx: Parameters<typeof requireAuth>[0]) {
  const user = await requireAnyVerticalOrAdmin(ctx, ["Operations"]);
  await requireArborInternalContext(ctx);
  return user;
}

function itemLabel(item: { assetId?: string; serialNumber?: string }) {
  return item.assetId ?? item.serialNumber ?? "this item";
}

/**
 * Take a unit out of service. `includeContents` retires everything nested
 * inside it too (a lost case loses what's in it) and keeps it nested, so
 * reinstating the case can bring it back; otherwise the contents are taken
 * out and stay in service.
 */
export const retire = mutation({
  args: {
    id: v.id("inventoryItems"),
    reason: retirementReasonValue,
    notes: v.optional(v.string()),
    replacementItemId: v.optional(v.id("inventoryItems")),
    counterparty: v.optional(v.string()),
    amountUsd: v.optional(v.number()),
    includeContents: v.boolean(),
  },
  returns: v.object({ retiredCount: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireInventoryManager(ctx);
    return await withReportableErrors("inventoryLifecycle.retire", async () => {
      const item = await ctx.db.get(args.id);
      if (!item) appError("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found.");
      if (lifecycleOf(item) === "retired") {
        appError("INVENTORY_ITEM_ALREADY_RETIRED", `${itemLabel(item)} is already retired.`);
      }
      const notes = args.notes?.trim() || undefined;
      const counterparty = args.counterparty?.trim() || undefined;
      if (args.reason === "other" && !notes) {
        appError("INVENTORY_RETIRE_NOTE_REQUIRED", "Add a note saying why it's being retired.");
      }
      if (args.reason === "duplicate" && !args.replacementItemId) {
        appError("INVENTORY_RETIRE_DUPLICATE_TARGET", "Pick the item this one duplicates.");
      }
      if (args.replacementItemId) {
        if (args.replacementItemId === item._id) {
          appError("INVENTORY_RETIRE_SELF_REPLACEMENT", "An item can't replace itself.");
        }
        const replacement = await ctx.db.get(args.replacementItemId);
        if (!replacement) appError("INVENTORY_ITEM_NOT_FOUND", "Replacement item not found.");
      }
      if (args.amountUsd !== undefined && (!Number.isFinite(args.amountUsd) || args.amountUsd < 0)) {
        appError("INVENTORY_RETIRE_AMOUNT_INVALID", "Enter a sale amount of zero or more.");
      }

      const actorUserId = getUserId(user);
      const now = Date.now();
      const details = {
        reason: args.reason,
        notes,
        replacementItemId: args.replacementItemId,
        counterparty,
        amountUsd: args.amountUsd,
      };
      // Read the tree before the root leaves its own container.
      const tree = await listItemWithDescendants(ctx, item._id);
      await retireItemRecord(ctx, item, details, actorUserId, now);

      let retiredCount = 1;
      if (args.includeContents) {
        for (const descendant of tree.slice(1)) {
          if (lifecycleOf(descendant) === "retired") continue;
          await retireItemRecord(
            ctx,
            descendant,
            { reason: args.reason, notes: `Inside ${itemLabel(item)}${notes ? `: ${notes}` : ""}` },
            actorUserId,
            now,
            // Stays in the case, so finding the case finds its contents.
            { keepContainer: true },
          );
          retiredCount += 1;
        }
      } else {
        for (const child of tree.filter((row) => row.containedInAssetId === item._id)) {
          await ctx.db.patch(child._id, { containedInAssetId: undefined, updatedAt: now });
        }
      }
      return { retiredCount };
    });
  },
});

/** Put a retired unit back in service: found, recovered, back from the vendor, or retired by mistake. */
export const reinstate = mutation({
  args: {
    id: v.id("inventoryItems"),
    notes: v.optional(v.string()),
    /** Also reinstate retired units still nested inside it. */
    includeContents: v.boolean(),
  },
  returns: v.object({ reinstatedCount: v.number() }),
  handler: async (ctx, args) => {
    const user = await requireInventoryManager(ctx);
    return await withReportableErrors("inventoryLifecycle.reinstate", async () => {
      const item = await ctx.db.get(args.id);
      if (!item) appError("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found.");
      if (lifecycleOf(item) !== "retired") {
        appError("INVENTORY_ITEM_NOT_RETIRED", `${itemLabel(item)} isn't retired.`);
      }
      const actorUserId = getUserId(user);
      const now = Date.now();
      const notes = args.notes?.trim() || undefined;
      const targets = args.includeContents
        ? (await listItemWithDescendants(ctx, item._id)).filter((row) => lifecycleOf(row) === "retired")
        : [item];
      for (const target of targets) {
        await ctx.db.patch(target._id, { lifecycle: "active", retirement: undefined, updatedAt: now });
        await recordItemHistory(ctx, {
          inventoryItemId: target._id,
          kind: "reinstated",
          reason: target.retirement?.reason,
          notes,
          actorUserId,
          at: now,
        });
      }
      return { reinstatedCount: targets.length };
    });
  },
});

/**
 * Relabel a unit: it gets a new tag and keeps answering to the old one, on
 * scans and on its public page. Nothing else can take the old tag.
 */
export const retag = mutation({
  args: {
    id: v.id("inventoryItems"),
    newAssetId: v.string(),
    notes: v.optional(v.string()),
  },
  returns: v.object({ assetId: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireInventoryManager(ctx);
    return await withReportableErrors("inventoryLifecycle.retag", async () => {
      const item = await ctx.db.get(args.id);
      if (!item) appError("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found.");
      const oldAssetId = item.assetId;
      if (!oldAssetId) {
        appError("INVENTORY_RETAG_NO_TAG", "This item has no tag yet. Add one in its details instead.");
      }
      const newAssetId = canonicalizeAssetIdTag(args.newAssetId);
      if (!newAssetId) appError("INVENTORY_RETAG_EMPTY", "Enter the new tag.");
      if (newAssetId === oldAssetId) appError("INVENTORY_RETAG_SAME", "That's the tag it already has.");

      const taken = await ctx.db
        .query("inventoryItems")
        .withIndex("by_assetId", (q) => q.eq("assetId", newAssetId))
        .unique();
      if (taken) appError("INVENTORY_ASSET_ID_EXISTS", `Asset ID already exists: ${newAssetId}`);
      const alias = await ctx.db
        .query("inventoryAssetIdAliases")
        .withIndex("by_assetId", (q) => q.eq("assetId", newAssetId))
        .first();
      if (alias && alias.inventoryItemId !== item._id && (await ctx.db.get(alias.inventoryItemId))) {
        appError("INVENTORY_ASSET_ID_RETIRED", `${newAssetId} is another item's old tag, so it can't be reused.`);
      }
      // Going back to one of its own old tags: that tag is current again.
      if (alias) await ctx.db.delete(alias._id);

      const now = Date.now();
      await ctx.db.insert("inventoryAssetIdAliases", {
        assetId: oldAssetId,
        inventoryItemId: item._id,
        createdAt: now,
      });
      await ctx.db.patch(item._id, { assetId: newAssetId, updatedAt: now });
      await refreshItemSearchText(ctx, item._id);
      await recordItemHistory(ctx, {
        inventoryItemId: item._id,
        kind: "retagged",
        fromAssetId: oldAssetId,
        toAssetId: newAssetId,
        notes: args.notes?.trim() || undefined,
        actorUserId: getUserId(user),
        at: now,
      });
      return { assetId: newAssetId };
    });
  },
});

/** Mark a unit in or out of repair by hand (damage reports also do it). */
export const setInRepair = mutation({
  args: {
    id: v.id("inventoryItems"),
    inRepair: v.boolean(),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireInventoryManager(ctx);
    return await withReportableErrors("inventoryLifecycle.setInRepair", async () => {
      const item = await ctx.db.get(args.id);
      if (!item) appError("INVENTORY_ITEM_NOT_FOUND", "Inventory item not found.");
      const current = lifecycleOf(item);
      if (current === "retired") {
        appError("INVENTORY_ITEM_RETIRED", `${itemLabel(item)} is retired. Reinstate it first.`);
      }
      const next = args.inRepair ? "in_repair" : "active";
      if (current === next) return null;
      const now = Date.now();
      await ctx.db.patch(item._id, { lifecycle: next, updatedAt: now });
      await recordItemHistory(ctx, {
        inventoryItemId: item._id,
        kind: args.inRepair ? "repair_started" : "repair_finished",
        notes: args.notes?.trim() || undefined,
        actorUserId: getUserId(user),
        at: now,
      });
      return null;
    });
  },
});

/** The item's lifecycle changes, newest first, with who made them. */
export const listHistory = query({
  args: { id: v.id("inventoryItems") },
  returns: v.array(
    v.object({
      _id: v.id("inventoryItemHistory"),
      kind: itemHistoryKindValue,
      reason: v.optional(retirementReasonValue),
      fromAssetId: v.optional(v.string()),
      toAssetId: v.optional(v.string()),
      notes: v.optional(v.string()),
      damageReportId: v.optional(v.id("damageReports")),
      actorName: v.string(),
      at: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const rows = await ctx.db
      .query("inventoryItemHistory")
      .withIndex("by_inventoryItemId_and_at", (q) => q.eq("inventoryItemId", args.id))
      .order("desc")
      .take(100);
    const users = await findAuthUsersByIds(
      ctx,
      rows.map((row) => row.actorUserId),
    );
    return rows.map((row) => {
      const actor = users.get(row.actorUserId);
      return {
        _id: row._id,
        kind: row.kind,
        reason: row.reason,
        fromAssetId: row.fromAssetId,
        toAssetId: row.toAssetId,
        notes: row.notes,
        damageReportId: row.damageReportId,
        actorName: actor?.name ?? actor?.email ?? "Arbor Live",
        at: row.at,
      };
    });
  },
});

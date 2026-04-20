import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const list = query({
  args: {
    category: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const items = await ctx.db.query("inventoryItems").collect();
    const loweredSearch = args.search?.trim().toLowerCase();

    const hydrated = await Promise.all(
      items.map(async (item) => {
        const type = await ctx.db.get(item.typeId);
        const location = item.storageLocationId
          ? await ctx.db.get(item.storageLocationId)
          : null;
        const containedInAsset = item.containedInAssetId
          ? await ctx.db.get(item.containedInAssetId)
          : null;
        const containedAssets = await ctx.db
          .query("inventoryItems")
          .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", item._id))
          .collect();
        return {
          ...item,
          type,
          location,
          containedInAsset,
          containedAssets,
        };
      }),
    );

    return hydrated
      .filter((item) => {
        if (!item.type) return false;
        if (args.category && item.type.category !== args.category) return false;
        if (!loweredSearch) return true;
        return (
          item.assetId.toLowerCase().includes(loweredSearch) ||
          (item.serialNumber ?? "").toLowerCase().includes(loweredSearch) ||
          item.type.model.toLowerCase().includes(loweredSearch) ||
          item.type.name.toLowerCase().includes(loweredSearch)
        );
      })
      .sort((a, b) => a.assetId.localeCompare(b.assetId));
  },
});

export const create = mutation({
  args: {
    assetId: v.string(),
    serialNumber: v.optional(v.string()),
    typeId: v.id("inventoryTypes"),
    storageLocationId: v.optional(v.id("storageLocations")),
    containedInAssetId: v.optional(v.id("inventoryItems")),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingAsset = await ctx.db
      .query("inventoryItems")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId.trim()))
      .unique();
    if (existingAsset) throw new Error("Asset ID already exists.");

    const type = await ctx.db.get(args.typeId);
    if (!type) throw new Error("Inventory type not found.");

    if (args.storageLocationId) {
      const location = await ctx.db.get(args.storageLocationId);
      if (!location) throw new Error("Storage location not found.");
    }
    if (args.containedInAssetId) {
      const container = await ctx.db.get(args.containedInAssetId);
      if (!container) throw new Error("Container asset not found.");
    }

    const now = Date.now();
    return await ctx.db.insert("inventoryItems", {
      assetId: args.assetId.trim(),
      serialNumber: args.serialNumber?.trim(),
      typeId: args.typeId,
      storageLocationId: args.storageLocationId,
      containedInAssetId: args.containedInAssetId,
      status: args.status?.trim(),
      notes: args.notes?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("inventoryItems"),
    assetId: v.string(),
    serialNumber: v.optional(v.string()),
    typeId: v.id("inventoryTypes"),
    storageLocationId: v.optional(v.id("storageLocations")),
    containedInAssetId: v.optional(v.id("inventoryItems")),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Inventory item not found.");

    const duplicateAsset = await ctx.db
      .query("inventoryItems")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId.trim()))
      .unique();
    if (duplicateAsset && duplicateAsset._id !== args.id) {
      throw new Error("Asset ID already exists.");
    }

    const type = await ctx.db.get(args.typeId);
    if (!type) throw new Error("Inventory type not found.");

    if (args.storageLocationId) {
      const location = await ctx.db.get(args.storageLocationId);
      if (!location) throw new Error("Storage location not found.");
    }
    if (args.containedInAssetId === args.id) {
      throw new Error("Asset cannot contain itself.");
    }
    if (args.containedInAssetId) {
      const container = await ctx.db.get(args.containedInAssetId);
      if (!container) throw new Error("Container asset not found.");
      let pointer: Id<"inventoryItems"> | undefined = args.containedInAssetId;
      while (pointer) {
        if (pointer === args.id) {
          throw new Error("Cannot create cyclical asset containment.");
        }
        const next: Doc<"inventoryItems"> | null = await ctx.db.get(pointer);
        pointer = next?.containedInAssetId;
      }
    }

    await ctx.db.patch(args.id, {
      assetId: args.assetId.trim(),
      serialNumber: args.serialNumber?.trim(),
      typeId: args.typeId,
      storageLocationId: args.storageLocationId,
      containedInAssetId: args.containedInAssetId,
      status: args.status?.trim(),
      notes: args.notes?.trim(),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("inventoryItems") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Inventory item not found.");
    const children = await ctx.db
      .query("inventoryItems")
      .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", args.id))
      .first();
    if (children) throw new Error("Cannot delete an asset that contains other assets.");
    await ctx.db.delete(args.id);
  },
});

export const setContainer = mutation({
  args: {
    id: v.id("inventoryItems"),
    containedInAssetId: v.optional(v.id("inventoryItems")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Inventory item not found.");
    if (args.containedInAssetId === args.id) {
      throw new Error("Asset cannot contain itself.");
    }
    if (args.containedInAssetId) {
      const container = await ctx.db.get(args.containedInAssetId);
      if (!container) throw new Error("Container asset not found.");
      let pointer: Id<"inventoryItems"> | undefined = args.containedInAssetId;
      while (pointer) {
        if (pointer === args.id) {
          throw new Error("Cannot create cyclical asset containment.");
        }
        const next: Doc<"inventoryItems"> | null = await ctx.db.get(pointer);
        pointer = next?.containedInAssetId;
      }
    }
    await ctx.db.patch(args.id, {
      containedInAssetId: args.containedInAssetId,
      updatedAt: Date.now(),
    });
  },
});

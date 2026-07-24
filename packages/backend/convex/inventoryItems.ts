import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/auth";

const MAX_LIST_LIMIT = 2000;
const MAX_ASSET_ID_LIMIT = 5000;

async function cascadeLocationToDescendants(
  ctx: MutationCtx,
  rootItemId: Id<"inventoryItems">,
  storageLocationId: Id<"storageLocations"> | undefined,
) {
  const queue: Id<"inventoryItems">[] = [rootItemId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = await ctx.db
      .query("inventoryItems")
      .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", currentId))
      .collect();

    for (const child of children) {
      await ctx.db.patch(child._id, {
        storageLocationId,
        updatedAt: Date.now(),
      });
      queue.push(child._id);
    }
  }
}

async function hydrateInventoryItems(ctx: QueryCtx, items: Doc<"inventoryItems">[]) {
  const typeIds = Array.from(new Set(items.map((item) => item.typeId)));
  const locationIds = Array.from(
    new Set(
      items
        .map((item) => item.storageLocationId)
        .filter((id): id is Id<"storageLocations"> => Boolean(id)),
    ),
  );
  const containerIds = Array.from(
    new Set(
      items
        .map((item) => item.containedInAssetId)
        .filter((id): id is Id<"inventoryItems"> => Boolean(id)),
    ),
  );

  const [types, locations, containers, containedAssetsLists] = await Promise.all([
    Promise.all(typeIds.map((id) => ctx.db.get(id))),
    Promise.all(locationIds.map((id) => ctx.db.get(id))),
    Promise.all(containerIds.map((id) => ctx.db.get(id))),
    Promise.all(
      items.map((item) =>
        ctx.db
          .query("inventoryItems")
          .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", item._id))
          .take(50),
      ),
    ),
  ]);

  const typeById = new Map(typeIds.map((id, index) => [id, types[index] ?? null]));
  const locationById = new Map(locationIds.map((id, index) => [id, locations[index] ?? null]));
  const containerById = new Map(containerIds.map((id, index) => [id, containers[index] ?? null]));

  return items.map((item, index) => ({
    ...item,
    type: typeById.get(item.typeId) ?? null,
    location: item.storageLocationId ? (locationById.get(item.storageLocationId) ?? null) : null,
    containedInAsset: item.containedInAssetId
      ? (containerById.get(item.containedInAssetId) ?? null)
      : null,
    containedAssets: containedAssetsLists[index] ?? [],
  }));
}

function matchesInventoryFilters(
  item: {
    assetId: string;
    serialNumber?: string;
    type: { category: string; model: string; name: string } | null;
  },
  args: { category?: string; search?: string },
) {
  if (!item.type) return false;
  if (args.category && item.type.category !== args.category) return false;
  const loweredSearch = args.search?.trim().toLowerCase();
  if (!loweredSearch) return true;
  return (
    item.assetId.toLowerCase().includes(loweredSearch) ||
    (item.serialNumber ?? "").toLowerCase().includes(loweredSearch) ||
    item.type.model.toLowerCase().includes(loweredSearch) ||
    item.type.name.toLowerCase().includes(loweredSearch)
  );
}

/** Paginated inventory list for the items manager. */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    category: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const result = await ctx.db.query("inventoryItems").paginate(args.paginationOpts);
    const hydrated = await hydrateInventoryItems(ctx, result.page);
    const page = hydrated
      .filter((item) => matchesInventoryFilters(item, args))
      .sort((a, b) => a.assetId.localeCompare(b.assetId));
    return { ...result, page };
  },
});

/**
 * Light rows for pickers/filters (packages manager). Bounded — not a full catalog dump.
 */
export const listSummaries = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const limit = Math.min(Math.max(args.limit ?? 1000, 1), MAX_LIST_LIMIT);
    const items = await ctx.db.query("inventoryItems").take(limit);
    const typeIds = Array.from(new Set(items.map((item) => item.typeId)));
    const types = await Promise.all(typeIds.map((id) => ctx.db.get(id)));
    const typeById = new Map(typeIds.map((id, index) => [id, types[index] ?? null]));

    return items
      .map((item) => ({
        _id: item._id,
        assetId: item.assetId,
        typeId: item.typeId,
        type: typeById.get(item.typeId) ?? null,
      }))
      .sort((a, b) => a.assetId.localeCompare(b.assetId));
  },
});

/** Cheap assetId → id map for CSV import / duplicate checks. */
export const listAssetIds = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const limit = Math.min(Math.max(args.limit ?? MAX_ASSET_ID_LIMIT, 1), MAX_ASSET_ID_LIMIT);
    const items = await ctx.db.query("inventoryItems").take(limit);
    return items.map((item) => ({
      _id: item._id,
      assetId: item.assetId,
    }));
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
    await requireAuth(ctx);
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
    let inheritedContainerLocationId: Id<"storageLocations"> | undefined;
    if (args.containedInAssetId) {
      const container = await ctx.db.get(args.containedInAssetId);
      if (!container) throw new Error("Container asset not found.");
      inheritedContainerLocationId = container.storageLocationId;
    }
    const effectiveStorageLocationId = inheritedContainerLocationId ?? args.storageLocationId;

    const now = Date.now();
    return await ctx.db.insert("inventoryItems", {
      assetId: args.assetId.trim(),
      serialNumber: args.serialNumber?.trim(),
      typeId: args.typeId,
      storageLocationId: effectiveStorageLocationId,
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
    await requireAuth(ctx);
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
    let inheritedContainerLocationId: Id<"storageLocations"> | undefined;
    if (args.containedInAssetId) {
      const container = await ctx.db.get(args.containedInAssetId);
      if (!container) throw new Error("Container asset not found.");
      inheritedContainerLocationId = container.storageLocationId;
      let pointer: Id<"inventoryItems"> | undefined = args.containedInAssetId;
      while (pointer) {
        if (pointer === args.id) {
          throw new Error("Cannot create cyclical asset containment.");
        }
        const next: Doc<"inventoryItems"> | null = await ctx.db.get(pointer);
        pointer = next?.containedInAssetId;
      }
    }
    const effectiveStorageLocationId = inheritedContainerLocationId ?? args.storageLocationId;

    await ctx.db.patch(args.id, {
      assetId: args.assetId.trim(),
      serialNumber: args.serialNumber?.trim(),
      typeId: args.typeId,
      storageLocationId: effectiveStorageLocationId,
      containedInAssetId: args.containedInAssetId,
      status: args.status?.trim(),
      notes: args.notes?.trim(),
      updatedAt: Date.now(),
    });

    await cascadeLocationToDescendants(ctx, args.id, effectiveStorageLocationId);
  },
});

export const remove = mutation({
  args: { id: v.id("inventoryItems") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
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
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Inventory item not found.");
    if (args.containedInAssetId === args.id) {
      throw new Error("Asset cannot contain itself.");
    }
    let inheritedContainerLocationId: Id<"storageLocations"> | undefined;
    if (args.containedInAssetId) {
      const container = await ctx.db.get(args.containedInAssetId);
      if (!container) throw new Error("Container asset not found.");
      inheritedContainerLocationId = container.storageLocationId;
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
      storageLocationId: inheritedContainerLocationId ?? existing.storageLocationId,
      updatedAt: Date.now(),
    });

    await cascadeLocationToDescendants(
      ctx,
      args.id,
      inheritedContainerLocationId ?? existing.storageLocationId,
    );
  },
});

import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

function normalizeName(name: string) {
  return name.trim();
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const locations = await ctx.db
      .query("storageLocations")
      .withIndex("by_path")
      .collect();
    return locations.sort((a, b) => a.path.localeCompare(b.path));
  },
});

export const get = query({
  args: { id: v.id("storageLocations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    parentId: v.optional(v.id("storageLocations")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const name = normalizeName(args.name);

    let path = name;
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent) throw new Error("Parent storage location not found.");
      path = `${parent.path} > ${name}`;
    }

    return await ctx.db.insert("storageLocations", {
      name,
      parentId: args.parentId,
      path,
      createdAt: now,
      updatedAt: now,
    });
  },
});

async function isDescendant(
  ctx: MutationCtx,
  candidateParentId: Id<"storageLocations">,
  currentId: Id<"storageLocations">,
) {
  let pointerId: Id<"storageLocations"> | undefined = candidateParentId;
  while (pointerId) {
    if (pointerId === currentId) return true;
    const current: Doc<"storageLocations"> | null = await ctx.db.get(pointerId);
    pointerId = current?.parentId;
  }
  return false;
}

export const update = mutation({
  args: {
    id: v.id("storageLocations"),
    name: v.string(),
    parentId: v.optional(v.id("storageLocations")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Storage location not found.");

    const name = normalizeName(args.name);

    if (args.parentId === args.id) {
      throw new Error("Location cannot be its own parent.");
    }

    if (args.parentId && (await isDescendant(ctx, args.parentId, args.id))) {
      throw new Error("Cannot move location under one of its descendants.");
    }

    let path = name;
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent) throw new Error("Parent storage location not found.");
      path = `${parent.path} > ${name}`;
    }

    await ctx.db.patch(args.id, {
      name,
      parentId: args.parentId,
      path,
      updatedAt: Date.now(),
    });

    const descendants = await ctx.db
      .query("storageLocations")
      .withIndex("by_path")
      .collect();

    const oldPrefix = existing.path;
    const newPrefix = path;
    for (const descendant of descendants) {
      if (descendant._id === args.id) continue;
      if (!descendant.path.startsWith(`${oldPrefix} > `)) continue;

      await ctx.db.patch(descendant._id, {
        path: descendant.path.replace(oldPrefix, newPrefix),
        updatedAt: Date.now(),
      });
    }
  },
});

export const remove = mutation({
  args: { id: v.id("storageLocations") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Storage location not found.");

    const child = await ctx.db
      .query("storageLocations")
      .withIndex("by_parentId", (q) => q.eq("parentId", args.id))
      .first();
    if (child) {
      throw new Error("Cannot delete location with child locations.");
    }

    const linkedInventory = await ctx.db
      .query("inventoryItems")
      .withIndex("by_storageLocationId", (q) => q.eq("storageLocationId", args.id))
      .first();
    if (linkedInventory) {
      throw new Error("Cannot delete location used by inventory items.");
    }

    await ctx.db.delete(args.id);
  },
});

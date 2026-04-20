import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const packageItemInput = v.object({
  typeId: v.id("inventoryTypes"),
  quantity: v.number(),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const packages = await ctx.db.query("inventoryPackages").collect();

    return await Promise.all(
      packages
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (pkg) => {
          const rows = await ctx.db
            .query("inventoryPackageItems")
            .withIndex("by_packageId", (q) => q.eq("packageId", pkg._id))
            .collect();

          const hydratedRows = await Promise.all(
            rows.map(async (row) => ({
              ...row,
              type: await ctx.db.get(row.typeId),
            })),
          );

          const estimatedRentalValueUsd = hydratedRows.reduce((acc, row) => {
            const normalRate =
              row.type?.nonSubsidizedRentalPriceUsd ?? row.type?.rentalPriceUsd;
            if (!normalRate) return acc;
            return acc + row.quantity * normalRate;
          }, 0);

          return {
            ...pkg,
            items: hydratedRows,
            estimatedRentalValueUsd,
          };
        }),
    );
  },
});

async function validatePackageItems(
  ctx: MutationCtx,
  items: Array<{ typeId: Id<"inventoryTypes">; quantity: number }>,
) {
  if (!items.length) throw new Error("Package must include at least one type.");
  for (const item of items) {
    if (item.quantity <= 0) {
      throw new Error("Package item quantity must be greater than zero.");
    }
    const type = await ctx.db.get(item.typeId);
    if (!type) throw new Error("One or more package types do not exist.");
  }
}

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    packagePriceCents: v.number(),
    active: v.optional(v.boolean()),
    items: v.array(packageItemInput),
  },
  handler: async (ctx, args) => {
    await validatePackageItems(ctx, args.items);
    const now = Date.now();

    const packageId = await ctx.db.insert("inventoryPackages", {
      name: args.name.trim(),
      description: args.description?.trim(),
      packagePriceCents: args.packagePriceCents,
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of args.items) {
      await ctx.db.insert("inventoryPackageItems", {
        packageId,
        typeId: item.typeId,
        quantity: item.quantity,
        createdAt: now,
        updatedAt: now,
      });
    }

    return packageId;
  },
});

export const update = mutation({
  args: {
    id: v.id("inventoryPackages"),
    name: v.string(),
    description: v.optional(v.string()),
    packagePriceCents: v.number(),
    active: v.boolean(),
    items: v.array(packageItemInput),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Package not found.");
    await validatePackageItems(ctx, args.items);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      description: args.description?.trim(),
      packagePriceCents: args.packagePriceCents,
      active: args.active,
      updatedAt: now,
    });

    const currentRows = await ctx.db
      .query("inventoryPackageItems")
      .withIndex("by_packageId", (q) => q.eq("packageId", args.id))
      .collect();
    for (const row of currentRows) {
      await ctx.db.delete(row._id);
    }

    for (const item of args.items) {
      await ctx.db.insert("inventoryPackageItems", {
        packageId: args.id,
        typeId: item.typeId,
        quantity: item.quantity,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const remove = mutation({
  args: { id: v.id("inventoryPackages") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Package not found.");

    const currentRows = await ctx.db
      .query("inventoryPackageItems")
      .withIndex("by_packageId", (q) => q.eq("packageId", args.id))
      .collect();
    for (const row of currentRows) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.delete(args.id);
  },
});

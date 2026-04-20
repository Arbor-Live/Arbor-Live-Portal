import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";

const categoryMetadataValue = v.object({
  lighting: v.optional(
    v.object({
      gdtfUrls: v.optional(v.array(v.string())),
      dmxModes: v.optional(v.array(v.string())),
      powerDrawWatts: v.optional(v.number()),
      wireless: v.optional(v.boolean()),
      battery: v.optional(v.boolean()),
      highCri: v.optional(v.boolean()),
    }),
  ),
});

async function validateCapabilities(
  ctx: MutationCtx,
  capabilities: string[],
) {
  for (const capability of capabilities) {
    const definition = await ctx.db
      .query("capabilityDefinitions")
      .withIndex("by_key", (q) => q.eq("key", capability))
      .unique();
    if (!definition || !definition.active) {
      throw new Error(`Unknown or inactive capability key: ${capability}`);
    }
  }
}

async function validateCategory(ctx: MutationCtx, category: string) {
  const key = category.trim().toLowerCase();
  const existing = await ctx.db
    .query("inventoryCategories")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!existing || !existing.active) {
    throw new Error(`Unknown or inactive category key: ${category}`);
  }
}

export const list = query({
  args: {
    category: v.optional(v.string()),
    capability: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const types = args.category
      ? await ctx.db
          .query("inventoryTypes")
          .withIndex("by_category", (q) => q.eq("category", args.category!))
          .collect()
      : await ctx.db.query("inventoryTypes").collect();

    const loweredSearch = args.search?.trim().toLowerCase();

    return types
      .filter((type) => {
        if (args.capability && !type.capabilities.includes(args.capability)) return false;
        if (!loweredSearch) return true;
        return (
          type.name.toLowerCase().includes(loweredSearch) ||
          type.model.toLowerCase().includes(loweredSearch) ||
          (type.manufacturer ?? "").toLowerCase().includes(loweredSearch)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const get = query({
  args: { id: v.id("inventoryTypes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    manufacturer: v.optional(v.string()),
    model: v.string(),
    msrpUsd: v.optional(v.number()),
    rentalPriceUsd: v.optional(v.number()),
    subsidizedRentalPriceUsd: v.optional(v.number()),
    nonSubsidizedRentalPriceUsd: v.optional(v.number()),
    manualUrls: v.optional(v.array(v.string())),
    tips: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    iconImageUrl: v.optional(v.string()),
    promoImageUrl: v.optional(v.string()),
    categoryMetadata: v.optional(categoryMetadataValue),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const capabilities = (args.capabilities ?? []).map((cap) => cap.trim().toLowerCase());
    await validateCapabilities(ctx, capabilities);
    await validateCategory(ctx, args.category);
    const subsidizedRentalPriceUsd =
      args.subsidizedRentalPriceUsd ??
      (args.msrpUsd !== undefined ? Number((args.msrpUsd * 0.05).toFixed(2)) : undefined);
    const nonSubsidizedRentalPriceUsd =
      args.nonSubsidizedRentalPriceUsd ??
      args.rentalPriceUsd ??
      (args.msrpUsd !== undefined ? Number((args.msrpUsd * 0.1).toFixed(2)) : undefined);

    return await ctx.db.insert("inventoryTypes", {
      name: args.name.trim(),
      category: args.category.trim().toLowerCase(),
      manufacturer: args.manufacturer?.trim(),
      model: args.model.trim(),
      msrpUsd: args.msrpUsd,
      rentalPriceUsd: nonSubsidizedRentalPriceUsd,
      subsidizedRentalPriceUsd,
      nonSubsidizedRentalPriceUsd,
      manualUrls: args.manualUrls ?? [],
      tips: args.tips?.trim(),
      capabilities,
      iconImageUrl: args.iconImageUrl?.trim(),
      promoImageUrl: args.promoImageUrl?.trim(),
      categoryMetadata: args.categoryMetadata,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("inventoryTypes"),
    name: v.string(),
    category: v.string(),
    manufacturer: v.optional(v.string()),
    model: v.string(),
    msrpUsd: v.optional(v.number()),
    rentalPriceUsd: v.optional(v.number()),
    subsidizedRentalPriceUsd: v.optional(v.number()),
    nonSubsidizedRentalPriceUsd: v.optional(v.number()),
    manualUrls: v.optional(v.array(v.string())),
    tips: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    iconImageUrl: v.optional(v.string()),
    promoImageUrl: v.optional(v.string()),
    categoryMetadata: v.optional(categoryMetadataValue),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Type not found.");

    const capabilities = (args.capabilities ?? []).map((cap) => cap.trim().toLowerCase());
    await validateCapabilities(ctx, capabilities);
    await validateCategory(ctx, args.category);
    const subsidizedRentalPriceUsd =
      args.subsidizedRentalPriceUsd ??
      (args.msrpUsd !== undefined
        ? Number((args.msrpUsd * 0.05).toFixed(2))
        : existing.subsidizedRentalPriceUsd);
    const nonSubsidizedRentalPriceUsd =
      args.nonSubsidizedRentalPriceUsd ??
      args.rentalPriceUsd ??
      (args.msrpUsd !== undefined
        ? Number((args.msrpUsd * 0.1).toFixed(2))
        : existing.nonSubsidizedRentalPriceUsd ?? existing.rentalPriceUsd);

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      category: args.category.trim().toLowerCase(),
      manufacturer: args.manufacturer?.trim(),
      model: args.model.trim(),
      msrpUsd: args.msrpUsd,
      rentalPriceUsd: nonSubsidizedRentalPriceUsd,
      subsidizedRentalPriceUsd,
      nonSubsidizedRentalPriceUsd,
      manualUrls: args.manualUrls ?? [],
      tips: args.tips?.trim(),
      capabilities,
      iconImageUrl: args.iconImageUrl?.trim(),
      promoImageUrl: args.promoImageUrl?.trim(),
      categoryMetadata: args.categoryMetadata,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("inventoryTypes") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Type not found.");

    const linkedItem = await ctx.db
      .query("inventoryItems")
      .withIndex("by_typeId", (q) => q.eq("typeId", args.id))
      .first();
    if (linkedItem) {
      throw new Error("Cannot delete type with linked inventory items.");
    }

    const linkedPackageItem = await ctx.db
      .query("inventoryPackageItems")
      .withIndex("by_typeId", (q) => q.eq("typeId", args.id))
      .first();
    if (linkedPackageItem) {
      throw new Error("Cannot delete type used in packages.");
    }

    await ctx.db.delete(args.id);
  },
});

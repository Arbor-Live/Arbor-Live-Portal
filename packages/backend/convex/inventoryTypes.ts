import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import {
  normalizeOptionalAssetReference,
  normalizeResourceLinksForUpload,
} from "./lib/inventoryUpload";

type InventoryCategoryMetadata = Doc<"inventoryTypes">["categoryMetadata"];

const resourceLinkInput = v.object({
  title: v.optional(v.string()),
  url: v.string(),
});

const categoryMetadataValue = v.object({
  lighting: v.optional(
    v.object({
      gdtfUrls: v.optional(v.array(resourceLinkInput)),
      dmxModes: v.optional(v.array(v.string())),
      powerDrawWatts: v.optional(v.number()),
      wireless: v.optional(v.boolean()),
      battery: v.optional(v.boolean()),
      highCri: v.optional(v.boolean()),
    }),
  ),
});

type ResourceLinkStored = { title: string; url: string };

function normalizeResourceLinksForStore(
  entries: Array<{ title?: string; url: string }> | undefined,
  defaultTitle: string,
): ResourceLinkStored[] {
  return normalizeResourceLinksForUpload(entries, defaultTitle);
}

function normalizeCategoryMetadataInput(
  input:
    | {
        lighting?: {
          gdtfUrls?: Array<{ title?: string; url: string }>;
          dmxModes?: string[];
          powerDrawWatts?: number;
          wireless?: boolean;
          battery?: boolean;
          highCri?: boolean;
        };
      }
    | undefined,
): InventoryCategoryMetadata | undefined {
  if (input === undefined) return undefined;
  if (Object.keys(input).length === 0) return undefined;
  if (!input.lighting) return input as InventoryCategoryMetadata;
  const { lighting } = input;
  const { gdtfUrls: _legacyGdtf, ...restLighting } = lighting;
  return {
    lighting: {
      ...restLighting,
      gdtfUrls: lighting.gdtfUrls
        ? normalizeResourceLinksForStore(lighting.gdtfUrls, "GDTF")
        : undefined,
    },
  } as InventoryCategoryMetadata;
}

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

function normalizePublicSlug(raw: string | undefined) {
  const slug = raw?.trim().toLowerCase();
  if (!slug) return undefined;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Public slug must be lowercase letters/numbers with single dashes.");
  }
  return slug;
}

async function assertUniqueTypePublicSlug(
  ctx: MutationCtx,
  slug: string | undefined,
  excludeId?: string,
) {
  if (!slug) return;
  const match = await ctx.db
    .query("inventoryTypes")
    .withIndex("by_publicSlug", (q) => q.eq("publicSlug", slug))
    .unique();
  if (match && (!excludeId || match._id !== excludeId)) {
    throw new Error("Public slug is already in use by another inventory type.");
  }
}

function matchesInventoryTypeSearch(type: Doc<"inventoryTypes">, loweredSearch: string) {
  if (
    type.name.toLowerCase().includes(loweredSearch) ||
    type.model.toLowerCase().includes(loweredSearch) ||
    (type.manufacturer ?? "").toLowerCase().includes(loweredSearch) ||
    (type.description ?? "").toLowerCase().includes(loweredSearch) ||
    (type.tips ?? "").toLowerCase().includes(loweredSearch) ||
    (type.publicSlug ?? "").toLowerCase().includes(loweredSearch)
  ) {
    return true;
  }

  return type.capabilities.some((capability) => capability.toLowerCase().includes(loweredSearch));
}

export const list = query({
  args: {
    category: v.optional(v.string()),
    capability: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    publicListing: v.optional(v.boolean()),
    publicProfile: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const types = args.category
      ? await ctx.db
          .query("inventoryTypes")
          .withIndex("by_category", (q) => q.eq("category", args.category!))
          .collect()
      : await ctx.db.query("inventoryTypes").collect();

    const loweredSearch = args.search?.trim().toLowerCase();
    const loweredManufacturer = args.manufacturer?.trim().toLowerCase();

    return types
      .filter((type) => {
        if (args.capability && !type.capabilities.includes(args.capability)) return false;
        if (args.publicListing !== undefined && Boolean(type.publicListing) !== args.publicListing) {
          return false;
        }
        if (args.publicProfile !== undefined && Boolean(type.publicProfile) !== args.publicProfile) {
          return false;
        }
        if (
          loweredManufacturer &&
          (type.manufacturer ?? "").trim().toLowerCase() !== loweredManufacturer
        ) {
          return false;
        }
        if (!loweredSearch) return true;
        return matchesInventoryTypeSearch(type, loweredSearch);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const get = query({
  args: { id: v.id("inventoryTypes") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    manufacturer: v.optional(v.string()),
    model: v.string(),
    msrpUsd: v.optional(v.number()),
    rentalPriceUsd: v.optional(v.number()),
    subsidizedRentalPriceUsd: v.optional(v.number()),
    nonSubsidizedRentalPriceUsd: v.optional(v.number()),
    manualUrls: v.optional(v.array(resourceLinkInput)),
    tips: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    iconImageUrl: v.optional(v.string()),
    promoImageUrl: v.optional(v.string()),
    categoryMetadata: v.optional(categoryMetadataValue),
    publicListing: v.optional(v.boolean()),
    publicProfile: v.optional(v.boolean()),
    publicSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
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

    const publicListing = args.publicListing ?? false;
    const publicProfile = args.publicProfile ?? false;
    const publicSlug = normalizePublicSlug(args.publicSlug);
    if (publicSlug) {
      await assertUniqueTypePublicSlug(ctx, publicSlug);
    }
    if (publicListing && publicSlug) {
      const packageSlug = await ctx.db
        .query("inventoryPackages")
        .withIndex("by_publicSlug", (q) => q.eq("publicSlug", publicSlug))
        .unique();
      if (packageSlug) {
        throw new Error("Public slug is already in use by a package.");
      }
    }

    return await ctx.db.insert("inventoryTypes", {
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      category: args.category.trim().toLowerCase(),
      manufacturer: args.manufacturer?.trim(),
      model: args.model.trim(),
      msrpUsd: args.msrpUsd,
      rentalPriceUsd: nonSubsidizedRentalPriceUsd,
      subsidizedRentalPriceUsd,
      nonSubsidizedRentalPriceUsd,
      manualUrls: normalizeResourceLinksForStore(args.manualUrls, "Manual"),
      tips: args.tips?.trim(),
      capabilities,
      iconImageUrl: normalizeOptionalAssetReference(args.iconImageUrl),
      promoImageUrl: normalizeOptionalAssetReference(args.promoImageUrl),
      categoryMetadata: normalizeCategoryMetadataInput(args.categoryMetadata ?? {}),
      publicListing,
      publicProfile,
      publicSlug,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("inventoryTypes"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    manufacturer: v.optional(v.string()),
    model: v.string(),
    msrpUsd: v.optional(v.number()),
    rentalPriceUsd: v.optional(v.number()),
    subsidizedRentalPriceUsd: v.optional(v.number()),
    nonSubsidizedRentalPriceUsd: v.optional(v.number()),
    manualUrls: v.optional(v.array(resourceLinkInput)),
    tips: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    iconImageUrl: v.optional(v.string()),
    promoImageUrl: v.optional(v.string()),
    categoryMetadata: v.optional(categoryMetadataValue),
    publicListing: v.optional(v.boolean()),
    publicProfile: v.optional(v.boolean()),
    publicSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
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

    const publicListing = args.publicListing ?? existing.publicListing ?? false;
    const publicProfile = args.publicProfile ?? existing.publicProfile ?? false;
    const publicSlug =
      args.publicSlug === undefined ? existing.publicSlug : normalizePublicSlug(args.publicSlug);
    if (publicSlug) {
      await assertUniqueTypePublicSlug(ctx, publicSlug, args.id);
    }
    if (publicListing && publicSlug) {
      const packageSlug = await ctx.db
        .query("inventoryPackages")
        .withIndex("by_publicSlug", (q) => q.eq("publicSlug", publicSlug))
        .unique();
      if (packageSlug) {
        throw new Error("Public slug is already in use by a package.");
      }
    }

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      category: args.category.trim().toLowerCase(),
      manufacturer: args.manufacturer?.trim(),
      model: args.model.trim(),
      msrpUsd: args.msrpUsd,
      rentalPriceUsd: nonSubsidizedRentalPriceUsd,
      subsidizedRentalPriceUsd,
      nonSubsidizedRentalPriceUsd,
      manualUrls: normalizeResourceLinksForStore(args.manualUrls, "Manual"),
      tips: args.tips?.trim(),
      capabilities,
      iconImageUrl: normalizeOptionalAssetReference(args.iconImageUrl),
      promoImageUrl: normalizeOptionalAssetReference(args.promoImageUrl),
      categoryMetadata:
        args.categoryMetadata !== undefined
          ? normalizeCategoryMetadataInput(args.categoryMetadata ?? {})
          : existing.categoryMetadata,
      publicListing,
      publicProfile,
      publicSlug,
      updatedAt: Date.now(),
    });
  },
});

export const bulkUpdateVisibility = mutation({
  args: {
    ids: v.array(v.id("inventoryTypes")),
    publicListing: v.optional(v.boolean()),
    publicProfile: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (!args.ids.length) {
      return { updated: 0 };
    }
    if (args.publicListing === undefined && args.publicProfile === undefined) {
      throw new Error("Specify at least one visibility field to update.");
    }

    const now = Date.now();
    let updated = 0;

    for (const id of args.ids) {
      const existing = await ctx.db.get(id);
      if (!existing) continue;

      const patch: {
        publicListing?: boolean;
        publicProfile?: boolean;
        updatedAt: number;
      } = { updatedAt: now };

      if (args.publicListing !== undefined) {
        patch.publicListing = args.publicListing;
      }
      if (args.publicProfile !== undefined) {
        patch.publicProfile = args.publicProfile;
      }

      await ctx.db.patch(id, patch);
      updated += 1;
    }

    return { updated };
  },
});

export const remove = mutation({
  args: { id: v.id("inventoryTypes") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
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

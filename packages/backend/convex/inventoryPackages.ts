import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/auth";
import { normalizeOptionalAssetReference } from "./lib/inventoryUpload";
import { scheduleInventoryPackageSiteRevalidation } from "./lib/scheduleSiteRevalidation";

const packageItemInput = v.object({
  typeId: v.id("inventoryTypes"),
  quantity: v.number(),
});

const publicBucketValue = v.union(
  v.literal("lighting"),
  v.literal("sound"),
  v.literal("environmental"),
  v.literal("staging"),
  v.literal("misc"),
);

function normalizePublicSlug(raw: string | undefined) {
  const slug = raw?.trim().toLowerCase();
  if (!slug) return undefined;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Public slug must be lowercase letters/numbers with single dashes.");
  }
  return slug;
}

async function assertUniquePackagePublicSlug(
  ctx: MutationCtx,
  slug: string | undefined,
  excludeId?: string,
) {
  if (!slug) return;
  const match = await ctx.db
    .query("inventoryPackages")
    .withIndex("by_publicSlug", (q) => q.eq("publicSlug", slug))
    .unique();
  if (match && (!excludeId || match._id !== excludeId)) {
    throw new Error("Public slug is already in use by another package.");
  }
}

const MAX_PACKAGE_LIST = 500;
const MAX_PACKAGE_ITEMS = 200;

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const limit = Math.min(Math.max(args.limit ?? MAX_PACKAGE_LIST, 1), MAX_PACKAGE_LIST);
    const packages = await ctx.db.query("inventoryPackages").take(limit);
    const sorted = packages.sort((a, b) => a.name.localeCompare(b.name));

    const packageItemRows = await Promise.all(
      sorted.map((pkg) =>
        ctx.db
          .query("inventoryPackageItems")
          .withIndex("by_packageId", (q) => q.eq("packageId", pkg._id))
          .take(MAX_PACKAGE_ITEMS),
      ),
    );

    const typeIds = Array.from(
      new Set(packageItemRows.flat().map((row) => row.typeId)),
    );
    const types = await Promise.all(typeIds.map((id) => ctx.db.get(id)));
    const typeById = new Map(typeIds.map((id, index) => [id, types[index] ?? null]));

    return sorted.map((pkg, index) => {
      const hydratedRows = (packageItemRows[index] ?? []).map((row) => ({
        ...row,
        type: typeById.get(row.typeId) ?? null,
      }));

      const estimatedRentalValueUsd = hydratedRows.reduce((acc, row) => {
        const normalRate =
          row.type?.nonSubsidizedRentalPriceUsd ?? row.type?.rentalPriceUsd;
        if (!normalRate) return acc;
        return acc + row.quantity * normalRate;
      }, 0);
      const estimatedSubsidizedRentalValueUsd = hydratedRows.reduce((acc, row) => {
        const subsidizedRate = row.type?.subsidizedRentalPriceUsd;
        if (!subsidizedRate) return acc;
        return acc + row.quantity * subsidizedRate;
      }, 0);

      return {
        ...pkg,
        items: hydratedRows,
        estimatedRentalValueUsd,
        estimatedSubsidizedRentalValueUsd,
      };
    });
  },
});

const MIN_PACKAGE_SEARCH_CHARS = 2;
const DEFAULT_PACKAGE_SEARCH_LIMIT = 40;

async function hydratePackageOptions(ctx: QueryCtx, packages: Doc<"inventoryPackages">[]) {
  const packageItemRows = await Promise.all(
    packages.map((pkg) =>
      ctx.db
        .query("inventoryPackageItems")
        .withIndex("by_packageId", (q) => q.eq("packageId", pkg._id))
        .take(MAX_PACKAGE_ITEMS),
    ),
  );
  const typeIds = Array.from(new Set(packageItemRows.flat().map((row) => row.typeId)));
  const types = await Promise.all(typeIds.map((id) => ctx.db.get(id)));
  const typeById = new Map(typeIds.map((id, index) => [id, types[index] ?? null]));

  return packages.map((pkg, index) => {
    const items = (packageItemRows[index] ?? []).map((row) => ({
      typeId: row.typeId,
      quantity: row.quantity,
      type: typeById.get(row.typeId)
        ? {
            name: typeById.get(row.typeId)!.name,
            model: typeById.get(row.typeId)!.model,
          }
        : null,
    }));
    return {
      _id: pkg._id,
      name: pkg.name,
      active: pkg.active,
      packagePriceCents: pkg.packagePriceCents,
      subsidizedPackagePriceUsd: pkg.subsidizedPackagePriceUsd,
      nonSubsidizedPackagePriceUsd: pkg.nonSubsidizedPackagePriceUsd,
      items,
    };
  });
}

/** Search-on-demand package picker results. Empty until the user types. */
export const searchOptions = query({
  args: {
    search: v.string(),
    limit: v.optional(v.number()),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const lowered = args.search.trim().toLowerCase();
    if (lowered.length < MIN_PACKAGE_SEARCH_CHARS) return [];

    const limit = Math.min(
      Math.max(args.limit ?? DEFAULT_PACKAGE_SEARCH_LIMIT, 1),
      60,
    );
    const candidates = await ctx.db.query("inventoryPackages").take(MAX_PACKAGE_LIST);
    const matched = candidates
      .filter((pkg) => {
        if (args.activeOnly && !pkg.active) return false;
        return pkg.name.toLowerCase().includes(lowered);
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);

    return await hydratePackageOptions(ctx, matched);
  },
});

export const getOptionsByIds = query({
  args: {
    ids: v.array(v.id("inventoryPackages")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const uniqueIds = Array.from(new Set(args.ids)).slice(0, 100);
    const rows = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));
    const packages = rows.filter((row): row is Doc<"inventoryPackages"> => Boolean(row));
    return await hydratePackageOptions(ctx, packages);
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
    subsidizedPackagePriceUsd: v.optional(v.number()),
    nonSubsidizedPackagePriceUsd: v.optional(v.number()),
    active: v.optional(v.boolean()),
    publicListing: v.optional(v.boolean()),
    publicBucket: v.optional(publicBucketValue),
    publicHeroImageUrl: v.optional(v.string()),
    publicSlug: v.optional(v.string()),
    items: v.array(packageItemInput),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await validatePackageItems(ctx, args.items);
    const now = Date.now();
    const publicListing = args.publicListing ?? false;
    const publicSlug = normalizePublicSlug(args.publicSlug);
    if (publicSlug) {
      await assertUniquePackagePublicSlug(ctx, publicSlug);
    }
    if (publicListing && publicSlug) {
      const typeSlug = await ctx.db
        .query("inventoryTypes")
        .withIndex("by_publicSlug", (q) => q.eq("publicSlug", publicSlug))
        .unique();
      if (typeSlug) {
        throw new Error("Public slug is already in use by an inventory type.");
      }
    }
    if (publicListing) {
      if (!args.publicBucket) {
        throw new Error("Choose a public browse section for this package.");
      }
    }

    const packageId = await ctx.db.insert("inventoryPackages", {
      name: args.name.trim(),
      description: args.description?.trim(),
      packagePriceCents: args.packagePriceCents,
      subsidizedPackagePriceUsd: args.subsidizedPackagePriceUsd,
      nonSubsidizedPackagePriceUsd: args.nonSubsidizedPackagePriceUsd,
      active: args.active ?? true,
      publicListing,
      publicBucket: publicListing ? args.publicBucket : undefined,
      publicHeroImageUrl: normalizeOptionalAssetReference(args.publicHeroImageUrl),
      publicSlug,
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

    if (publicListing) {
      await scheduleInventoryPackageSiteRevalidation(ctx, packageId);
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
    subsidizedPackagePriceUsd: v.optional(v.number()),
    nonSubsidizedPackagePriceUsd: v.optional(v.number()),
    active: v.boolean(),
    publicListing: v.optional(v.boolean()),
    publicBucket: v.optional(publicBucketValue),
    publicHeroImageUrl: v.optional(v.string()),
    publicSlug: v.optional(v.string()),
    items: v.array(packageItemInput),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Package not found.");
    await validatePackageItems(ctx, args.items);

    const now = Date.now();
    const publicListing = args.publicListing ?? existing.publicListing ?? false;
    const publicSlug =
      args.publicSlug === undefined ? existing.publicSlug : normalizePublicSlug(args.publicSlug);
    if (publicSlug) {
      await assertUniquePackagePublicSlug(ctx, publicSlug, args.id);
    }
    if (publicListing && publicSlug) {
      const typeSlug = await ctx.db
        .query("inventoryTypes")
        .withIndex("by_publicSlug", (q) => q.eq("publicSlug", publicSlug))
        .unique();
      if (typeSlug) {
        throw new Error("Public slug is already in use by an inventory type.");
      }
    }
    if (publicListing) {
      const nextBucket = args.publicBucket ?? existing.publicBucket;
      if (!nextBucket) {
        throw new Error("Choose a public browse section for this package.");
      }
    }

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      description: args.description?.trim(),
      packagePriceCents: args.packagePriceCents,
      subsidizedPackagePriceUsd: args.subsidizedPackagePriceUsd,
      nonSubsidizedPackagePriceUsd: args.nonSubsidizedPackagePriceUsd,
      active: args.active,
      publicListing,
      publicBucket: publicListing ? (args.publicBucket ?? existing.publicBucket) : undefined,
      publicHeroImageUrl: normalizeOptionalAssetReference(args.publicHeroImageUrl),
      publicSlug,
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

    if (publicListing || existing.publicListing) {
      await scheduleInventoryPackageSiteRevalidation(ctx, args.id);
    }
  },
});

export const remove = mutation({
  args: { id: v.id("inventoryPackages") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
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

    if (existing.publicListing) {
      await scheduleInventoryPackageSiteRevalidation(ctx, args.id);
    }
  },
});

import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const publicBucketValue = v.union(
  v.literal("lighting"),
  v.literal("sound"),
  v.literal("environmental"),
  v.literal("staging"),
  v.literal("misc"),
);

type PublicBucket = "lighting" | "sound" | "environmental" | "staging" | "misc";

function inferBucketFromCategoryKey(key: string): PublicBucket | undefined {
  const k = key.toLowerCase();
  if (k.includes("light") || k.includes("dmx")) return "lighting";
  if (k.includes("sound") || k.includes("speaker") || k.includes("mic") || k.includes("audio")) {
    return "sound";
  }
  if (k.includes("environment")) return "environmental";
  if (k === "misc" || k.startsWith("misc_") || k.includes("misc")) return "misc";
  if (k.includes("stage") || k.includes("rig") || k.includes("stand") || k.includes("case")) {
    return "staging";
  }
  return undefined;
}

async function bucketForCategoryKey(
  ctx: QueryCtx,
  categoryKey: string,
  categoryCache: Map<string, Doc<"inventoryCategories"> | null>,
): Promise<PublicBucket> {
  let category = categoryCache.get(categoryKey);
  if (category === undefined) {
    const doc = await ctx.db
      .query("inventoryCategories")
      .withIndex("by_key", (q) => q.eq("key", categoryKey))
      .unique();
    category = doc;
    categoryCache.set(categoryKey, doc);
  }

  if (category?.publicBucket) return category.publicBucket;
  return inferBucketFromCategoryKey(categoryKey) ?? "misc";
}

function sanitizeTypeForPublic(type: Doc<"inventoryTypes">, includeProfile: boolean) {
  const description = type.description?.trim() ? type.description : undefined;
  const shared = {
    _id: type._id,
    name: type.name,
    category: type.category,
    description,
    capabilities: type.capabilities,
  };

  if (!includeProfile) {
    return {
      ...shared,
      publicProfileEnabled: false as const,
    };
  }

  return {
    ...shared,
    model: type.model,
    manufacturer: type.manufacturer,
    manualUrls: type.manualUrls,
    tips: type.tips,
    iconImageUrl: type.iconImageUrl,
    promoImageUrl: type.promoImageUrl,
    categoryMetadata: type.categoryMetadata,
    publicSlug: type.publicSlug,
    publicProfileEnabled: true as const,
  };
}

export const equipmentByAssetId = query({
  args: { assetId: v.string() },
  handler: async (ctx, args) => {
    const assetId = args.assetId.trim();
    if (!assetId) return null;

    const item = await ctx.db
      .query("inventoryItems")
      .withIndex("by_assetId", (q) => q.eq("assetId", assetId))
      .unique();
    if (!item) return null;

    const type = await ctx.db.get(item.typeId);
    if (!type) return null;

    const settings = await ctx.db.query("lostFoundSettings").first();
    const showProfile = Boolean(type.publicListing && type.publicProfile);

    return {
      assetId: item.assetId,
      serialNumber: item.serialNumber,
      lostFound: {
        instructions: settings?.instructions,
        contactEmail: settings?.contactEmail,
        infoUrl: settings?.infoUrl,
      },
      type: sanitizeTypeForPublic(type, showProfile),
    };
  },
});

export const listPublicCapabilityFilters = query({
  args: {},
  handler: async (ctx) => {
    const caps = await ctx.db
      .query("capabilityDefinitions")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    return caps
      .map((c) => ({ key: c.key, label: c.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  },
});

export const listPublicTypes = query({
  args: {
    bucket: v.optional(publicBucketValue),
    capability: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const types = await ctx.db.query("inventoryTypes").collect();
    const categoryCache = new Map<string, Doc<"inventoryCategories"> | null>();
    const capFilter = args.capability?.trim().toLowerCase();

    const rows = [];
    for (const type of types) {
      if (!type.publicListing) continue;
      if (capFilter && !type.capabilities.includes(capFilter)) continue;
      const bucket = await bucketForCategoryKey(ctx, type.category, categoryCache);
      if (args.bucket && bucket !== args.bucket) continue;
      rows.push({
        bucket,
        type: sanitizeTypeForPublic(type, Boolean(type.publicProfile)),
      });
    }

    rows.sort((a, b) => a.type.name.localeCompare(b.type.name));
    return rows;
  },
});

export const listPublicPackages = query({
  args: {
    bucket: v.optional(publicBucketValue),
  },
  handler: async (ctx, args) => {
    const packages = await ctx.db.query("inventoryPackages").collect();
    const categoryCache = new Map<string, Doc<"inventoryCategories"> | null>();

    const rows = [];
    for (const pkg of packages) {
      if (!pkg.active || !pkg.publicListing) continue;

      const lineRows = await ctx.db
        .query("inventoryPackageItems")
        .withIndex("by_packageId", (q) => q.eq("packageId", pkg._id))
        .collect();

      const buckets = new Set<PublicBucket>();
      for (const row of lineRows) {
        const type = await ctx.db.get(row.typeId);
        if (!type) continue;
        buckets.add(await bucketForCategoryKey(ctx, type.category, categoryCache));
      }

      const dominantBucket = pickDominantBucket(buckets);
      const displayBucket = pkg.publicBucket ?? dominantBucket;
      if (args.bucket && displayBucket !== args.bucket) continue;

      rows.push({
        bucket: displayBucket,
        package: {
          _id: pkg._id,
          name: pkg.name,
          description: pkg.description,
          publicHeroImageUrl: pkg.publicHeroImageUrl,
          publicSlug: pkg.publicSlug,
        },
      });
    }

    rows.sort((a, b) => a.package.name.localeCompare(b.package.name));
    return rows;
  },
});

export const getPublicPackage = query({
  args: { packageId: v.id("inventoryPackages") },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg || !pkg.active || !pkg.publicListing) return null;

    const categoryCache = new Map<string, Doc<"inventoryCategories"> | null>();
    const lineRows = await ctx.db
      .query("inventoryPackageItems")
      .withIndex("by_packageId", (q) => q.eq("packageId", pkg._id))
      .collect();

    const buckets = new Set<PublicBucket>();
    const items = [];
    for (const row of lineRows) {
      const type = await ctx.db.get(row.typeId);
      if (!type) continue;
      const bucket = await bucketForCategoryKey(ctx, type.category, categoryCache);
      buckets.add(bucket);
      items.push({
        quantity: row.quantity,
        bucket,
        type: sanitizeTypeForPublic(type, Boolean(type.publicListing && type.publicProfile)),
      });
    }

    const dominantBucket = pickDominantBucket(buckets);
    const displayBucket = pkg.publicBucket ?? dominantBucket;

    return {
      bucket: displayBucket,
      package: {
        _id: pkg._id,
        name: pkg.name,
        description: pkg.description,
        publicHeroImageUrl: pkg.publicHeroImageUrl,
        publicSlug: pkg.publicSlug,
      },
      items,
    };
  },
});

function pickDominantBucket(buckets: Set<PublicBucket>): PublicBucket {
  if (buckets.size === 1) {
    return [...buckets][0]!;
  }
  // Mixed packages: group under misc as a catch-all when line items span buckets.
  return "misc";
}

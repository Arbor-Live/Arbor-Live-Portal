import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { resolveStoredInventoryAssetUrl } from "./inventoryR2";
import { assetIdLookupCandidates } from "./lib/assetScan";
import { listFulfillmentPackageBom } from "./lib/packageBom";

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

async function resolvePublicAssetUrl(value: string | undefined) {
  return await resolveStoredInventoryAssetUrl(value);
}

async function resolveResourceLinks(links: Array<{ title: string; url: string }>) {
  return Promise.all(
    links.map(async (link) => ({
      title: link.title,
      url: (await resolvePublicAssetUrl(link.url)) ?? link.url,
    })),
  );
}

async function sanitizeTypeForPublic(type: Doc<"inventoryTypes">, includeProfile: boolean) {
  const description = type.description?.trim() ? type.description : undefined;
  const shared = {
    _id: type._id,
    name: type.name,
    model: type.model,
    manufacturer: type.manufacturer,
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

  const categoryMetadata = type.categoryMetadata?.lighting?.gdtfUrls?.length
    ? {
        lighting: {
          ...type.categoryMetadata.lighting,
          gdtfUrls: await resolveResourceLinks(type.categoryMetadata.lighting.gdtfUrls),
        },
      }
    : type.categoryMetadata;

  return {
    ...shared,
    manualUrls: await resolveResourceLinks(type.manualUrls),
    tips: type.tips,
    iconImageUrl: await resolvePublicAssetUrl(type.iconImageUrl),
    promoImageUrl: await resolvePublicAssetUrl(type.promoImageUrl),
    categoryMetadata,
    publicSlug: type.publicSlug,
    publicProfileEnabled: true as const,
  };
}

export const equipmentByAssetId = query({
  args: { assetId: v.string() },
  handler: async (ctx, args) => {
    const assetId = args.assetId.trim();
    if (!assetId) return null;

    let item: Doc<"inventoryItems"> | null = null;
    for (const candidate of assetIdLookupCandidates(assetId)) {
      item = await ctx.db
        .query("inventoryItems")
        .withIndex("by_assetId", (q) => q.eq("assetId", candidate))
        .unique();
      if (item) break;
    }
    if (!item?.assetId) return null;

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
      type: await sanitizeTypeForPublic(type, showProfile),
    };
  },
});

export const listPublicCapabilityFilters = query({
  args: {},
  handler: async (ctx) => {
    const caps = await ctx.db
      .query("capabilityDefinitions")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(200);
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
    const types = await ctx.db
      .query("inventoryTypes")
      .withIndex("by_publicListing", (q) => q.eq("publicListing", true))
      .take(500);
    const categoryCache = new Map<string, Doc<"inventoryCategories"> | null>();
    const capFilter = args.capability?.trim().toLowerCase();

    const rows = [];
    for (const type of types) {
      if (capFilter && !type.capabilities.includes(capFilter)) continue;
      const bucket = await bucketForCategoryKey(ctx, type.category, categoryCache);
      if (args.bucket && bucket !== args.bucket) continue;
      rows.push({
        bucket,
        type: await sanitizeTypeForPublic(type, Boolean(type.publicProfile)),
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
    const packages = await ctx.db
      .query("inventoryPackages")
      .withIndex("by_publicListing", (q) => q.eq("publicListing", true))
      .take(500);
    // Prefer stored publicBucket (required on create/update when listed). Fall
    // back to line-item inference only for legacy rows missing the field —
    // otherwise every browse hit paid N package-lines × type lookups.
    const categoryCache = new Map<string, Doc<"inventoryCategories"> | null>();

    const rows = [];
    for (const pkg of packages) {
      if (!pkg.active) continue;

      let displayBucket: PublicBucket | undefined = pkg.publicBucket;
      if (!displayBucket) {
        const bom = await listFulfillmentPackageBom(ctx, pkg._id);
        const buckets = new Set<PublicBucket>();
        for (const row of bom) {
          const type = await ctx.db.get(row.typeId);
          if (!type) continue;
          buckets.add(await bucketForCategoryKey(ctx, type.category, categoryCache));
        }
        displayBucket = pickDominantBucket(buckets);
      }

      if (args.bucket && displayBucket !== args.bucket) continue;

      rows.push({
        bucket: displayBucket,
        package: {
          _id: pkg._id,
          name: pkg.name,
          description: pkg.description,
          publicHeroImageUrl: await resolvePublicAssetUrl(pkg.publicHeroImageUrl),
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
      .take(500);

    const groups = await ctx.db
      .query("inventoryPackageOptionGroups")
      .withIndex("by_packageId", (q) => q.eq("packageId", pkg._id))
      .take(40);
    groups.sort((a, b) => a.sortOrder - b.sortOrder);

    const buckets = new Set<PublicBucket>();
    const contents = [];

    for (const group of groups) {
      const optionsRaw = await ctx.db
        .query("inventoryPackageOptions")
        .withIndex("by_optionGroupId", (q) => q.eq("optionGroupId", group._id))
        .take(40);
      optionsRaw.sort((a, b) => a.sortOrder - b.sortOrder);

      const options = [];
      for (const option of optionsRaw) {
        const optionItems = lineRows
          .filter((row) => row.optionId === option._id)
          .sort((a, b) => {
            const roleA = a.role ?? "accessory";
            const roleB = b.role ?? "accessory";
            if (roleA !== roleB) return roleA === "primary" ? -1 : 1;
            return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          });

        const publicItems = [];
        for (const row of optionItems) {
          const type = await ctx.db.get(row.typeId);
          if (!type) continue;
          const bucket = await bucketForCategoryKey(ctx, type.category, categoryCache);
          buckets.add(bucket);
          publicItems.push({
            quantity: row.quantity * group.quantity,
            role: (row.role ?? "accessory") as "primary" | "accessory",
            bucket,
            type: await sanitizeTypeForPublic(
              type,
              Boolean(type.publicListing && type.publicProfile),
            ),
          });
        }

        const primary = publicItems.find((item) => item.role === "primary");
        options.push({
          name: option.name?.trim() || primary?.type.name || "Option",
          items: publicItems,
        });
      }

      if (!options.length) continue;
      contents.push({
        quantity: group.quantity,
        exclusive: options.length > 1,
        options,
      });
    }

    // Legacy flat always-included rows.
    for (const row of lineRows.filter((entry) => !entry.optionId)) {
      const type = await ctx.db.get(row.typeId);
      if (!type) continue;
      const bucket = await bucketForCategoryKey(ctx, type.category, categoryCache);
      buckets.add(bucket);
      contents.push({
        quantity: row.quantity,
        exclusive: false,
        options: [
          {
            name: type.name,
            items: [
              {
                quantity: row.quantity,
                role: "primary" as const,
                bucket,
                type: await sanitizeTypeForPublic(
                  type,
                  Boolean(type.publicListing && type.publicProfile),
                ),
              },
            ],
          },
        ],
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
        publicHeroImageUrl: await resolvePublicAssetUrl(pkg.publicHeroImageUrl),
        publicSlug: pkg.publicSlug,
      },
      contents,
    };
  },
});

function pickDominantBucket(buckets: Set<PublicBucket>): PublicBucket {
  if (buckets.size === 1) {
    return [...buckets][0]!;
  }
  return "misc";
}

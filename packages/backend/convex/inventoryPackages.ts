import { v } from "convex/values";
import { mutation, query, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/auth";
import { normalizeOptionalAssetReference } from "./lib/inventoryUpload";
import {
  collectKeysFromInventoryPackage,
  releaseReplacedR2Reference,
  releaseR2Keys,
} from "./lib/r2Lifecycle";
import {
  estimatePackageRentalValueFromContents,
  listFulfillmentPackageBom,
  type HydratedContentUnit,
} from "./lib/packageBom";
import { consolidatePackageIntoOneIncludedUnit } from "./lib/packageContentMigration";
import { scheduleInventoryPackageSiteRevalidation } from "./lib/scheduleSiteRevalidation";

const packageItemInput = v.object({
  typeId: v.id("inventoryTypes"),
  quantity: v.number(),
});

const packageOptionItemInput = v.object({
  typeId: v.id("inventoryTypes"),
  quantity: v.number(),
  role: v.union(v.literal("primary"), v.literal("accessory")),
});

const packageOptionInput = v.object({
  name: v.optional(v.string()),
  items: v.array(packageOptionItemInput),
});

const packageContentUnitInput = v.object({
  quantity: v.number(),
  options: v.array(packageOptionInput),
});

type WriteContentUnit = {
  quantity: number;
  options: Array<{
    name?: string;
    items: Array<{
      typeId: Id<"inventoryTypes">;
      quantity: number;
      role: "primary" | "accessory";
    }>;
  }>;
};

/** Prefer `contents`; fall back to legacy flat `items` as one included unit. */
function normalizeWriteContents(args: {
  contents?: WriteContentUnit[];
  items?: Array<{ typeId: Id<"inventoryTypes">; quantity: number }>;
}): WriteContentUnit[] {
  if (args.contents?.length) {
    return args.contents.map((unit) => ({
      quantity: unit.quantity,
      options: unit.options.map((option) => ({
        ...(option.name?.trim() ? { name: option.name.trim() } : {}),
        items: option.items,
      })),
    }));
  }
  if (args.items?.length) {
    return [
      {
        quantity: 1,
        options: [
          {
            items: args.items.map((item, index) => ({
              typeId: item.typeId,
              quantity: item.quantity,
              role: (index === 0 ? "primary" : "accessory") as "primary" | "accessory",
            })),
          },
        ],
      },
    ];
  }
  return [];
}

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
const MAX_PACKAGE_ITEMS = 500;
const MAX_CONTENT_UNITS = 40;
const MAX_OPTIONS_PER_UNIT = 20;
const MAX_ITEMS_PER_OPTION = 40;

async function loadContentUnits(
  ctx: QueryCtx | MutationCtx,
  packageId: Id<"inventoryPackages">,
  packageItems: Doc<"inventoryPackageItems">[],
): Promise<HydratedContentUnit[]> {
  const groups = await ctx.db
    .query("inventoryPackageOptionGroups")
    .withIndex("by_packageId", (q) => q.eq("packageId", packageId))
    .take(MAX_CONTENT_UNITS);
  groups.sort((a, b) => a.sortOrder - b.sortOrder);

  const itemsByOptionId = new Map<Id<"inventoryPackageOptions">, Doc<"inventoryPackageItems">[]>();
  for (const item of packageItems) {
    if (!item.optionId) continue;
    const list = itemsByOptionId.get(item.optionId) ?? [];
    list.push(item);
    itemsByOptionId.set(item.optionId, list);
  }

  const hydrated: HydratedContentUnit[] = [];
  for (const group of groups) {
    const options = await ctx.db
      .query("inventoryPackageOptions")
      .withIndex("by_optionGroupId", (q) => q.eq("optionGroupId", group._id))
      .take(MAX_OPTIONS_PER_UNIT);
    options.sort((a, b) => a.sortOrder - b.sortOrder);

    const hydratedOptions = [];
    for (const option of options) {
      const items = [...(itemsByOptionId.get(option._id) ?? [])].sort((a, b) => {
        const roleA = a.role ?? "accessory";
        const roleB = b.role ?? "accessory";
        if (roleA !== roleB) return roleA === "primary" ? -1 : 1;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
      const types = await Promise.all(items.map((row) => ctx.db.get(row.typeId)));
      const primaryType = items.find((row) => row.role === "primary");
      const primaryTypeDoc = primaryType
        ? types[items.indexOf(primaryType)] ?? null
        : null;
      hydratedOptions.push({
        _id: option._id,
        name: option.name?.trim() || primaryTypeDoc?.name || "Option",
        sortOrder: option.sortOrder,
        items: items.map((row, index) => ({
          _id: row._id,
          typeId: row.typeId,
          quantity: row.quantity,
          role: (row.role ?? "accessory") as "primary" | "accessory",
          sortOrder: row.sortOrder ?? index,
          type: types[index] ?? null,
        })),
      });
    }

    hydrated.push({
      _id: group._id,
      quantity: group.quantity,
      sortOrder: group.sortOrder,
      exclusive: hydratedOptions.length > 1,
      options: hydratedOptions,
    });
  }

  // Drop empty shells left over from earlier option-item experiments.
  const nonEmpty = hydrated.filter((unit) =>
    unit.options.some((option) => option.items.length > 0),
  );

  // Legacy flat always-included rows (no optionId) → synthetic single-option units.
  const legacyFixed = packageItems.filter((row) => !row.optionId);
  for (let index = 0; index < legacyFixed.length; index += 1) {
    const row = legacyFixed[index]!;
    const type = await ctx.db.get(row.typeId);
    nonEmpty.push({
      _id: row._id as unknown as Id<"inventoryPackageOptionGroups">,
      quantity: row.quantity,
      sortOrder: 10_000 + index,
      exclusive: false,
      options: [
        {
          _id: row._id as unknown as Id<"inventoryPackageOptions">,
          name: type?.name ?? "Item",
          sortOrder: 0,
          items: [
            {
              _id: row._id,
              typeId: row.typeId,
              quantity: 1,
              role: "primary",
              sortOrder: 0,
              type,
            },
          ],
        },
      ],
    });
  }

  return nonEmpty;
}

async function deleteOptionStructureForPackage(
  ctx: MutationCtx,
  packageId: Id<"inventoryPackages">,
) {
  const groups = await ctx.db
    .query("inventoryPackageOptionGroups")
    .withIndex("by_packageId", (q) => q.eq("packageId", packageId))
    .collect();
  for (const group of groups) {
    const options = await ctx.db
      .query("inventoryPackageOptions")
      .withIndex("by_optionGroupId", (q) => q.eq("optionGroupId", group._id))
      .collect();
    for (const option of options) {
      await ctx.db.delete(option._id);
    }
    await ctx.db.delete(group._id);
  }
}

async function replacePackageContents(
  ctx: MutationCtx,
  packageId: Id<"inventoryPackages">,
  contents: Array<{
    quantity: number;
    options: Array<{
      name?: string;
      items: Array<{
        typeId: Id<"inventoryTypes">;
        quantity: number;
        role: "primary" | "accessory";
      }>;
    }>;
  }>,
  now: number,
) {
  const currentRows = await ctx.db
    .query("inventoryPackageItems")
    .withIndex("by_packageId", (q) => q.eq("packageId", packageId))
    .collect();
  for (const row of currentRows) {
    await ctx.db.delete(row._id);
  }
  await deleteOptionStructureForPackage(ctx, packageId);

  for (let unitIndex = 0; unitIndex < contents.length; unitIndex += 1) {
    const unit = contents[unitIndex]!;
    const optionGroupId = await ctx.db.insert("inventoryPackageOptionGroups", {
      packageId,
      quantity: unit.quantity,
      sortOrder: unitIndex,
      createdAt: now,
      updatedAt: now,
    });

    for (let optionIndex = 0; optionIndex < unit.options.length; optionIndex += 1) {
      const option = unit.options[optionIndex]!;
      const optionId = await ctx.db.insert("inventoryPackageOptions", {
        optionGroupId,
        name: option.name?.trim() || undefined,
        sortOrder: optionIndex,
        createdAt: now,
        updatedAt: now,
      });

      for (let itemIndex = 0; itemIndex < option.items.length; itemIndex += 1) {
        const item = option.items[itemIndex]!;
        await ctx.db.insert("inventoryPackageItems", {
          packageId,
          typeId: item.typeId,
          quantity: item.quantity,
          optionId,
          role: item.role,
          sortOrder: itemIndex,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }
}

async function validateContents(
  ctx: MutationCtx,
  contents: Array<{
    quantity: number;
    options: Array<{
      name?: string;
      items: Array<{
        typeId: Id<"inventoryTypes">;
        quantity: number;
        role: "primary" | "accessory";
      }>;
    }>;
  }>,
) {
  if (!contents.length) {
    throw new Error("Package must include at least one content unit.");
  }
  if (contents.length > MAX_CONTENT_UNITS) {
    throw new Error(`Package can have at most ${MAX_CONTENT_UNITS} content units.`);
  }

  for (const [unitIndex, unit] of contents.entries()) {
    if (unit.quantity <= 0) {
      throw new Error(`Content unit ${unitIndex + 1} quantity must be greater than zero.`);
    }
    if (!unit.options.length) {
      throw new Error(`Content unit ${unitIndex + 1} needs at least one option.`);
    }
    if (unit.options.length > MAX_OPTIONS_PER_UNIT) {
      throw new Error(
        `Content unit ${unitIndex + 1} can have at most ${MAX_OPTIONS_PER_UNIT} options.`,
      );
    }

    for (const [optionIndex, option] of unit.options.entries()) {
      const label = option.name?.trim() || `option ${optionIndex + 1}`;
      if (!option.items.length) {
        throw new Error(`Content unit ${unitIndex + 1} ${label} must include at least one item.`);
      }
      if (option.items.length > MAX_ITEMS_PER_OPTION) {
        throw new Error(
          `Content unit ${unitIndex + 1} ${label} can have at most ${MAX_ITEMS_PER_OPTION} items.`,
        );
      }
      const primaryCount = option.items.filter((item) => item.role === "primary").length;
      if (primaryCount !== 1) {
        throw new Error(
          `Content unit ${unitIndex + 1} ${label} must have exactly one primary item (got ${primaryCount}).`,
        );
      }
      for (const item of option.items) {
        if (item.quantity <= 0) {
          throw new Error(
            `Content unit ${unitIndex + 1} ${label} item quantity must be greater than zero.`,
          );
        }
        const type = await ctx.db.get(item.typeId);
        if (!type) {
          throw new Error(`Content unit ${unitIndex + 1} ${label} references a missing inventory type.`);
        }
      }
    }
  }
}

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

    const contentsByPackage = await Promise.all(
      sorted.map((pkg, index) => loadContentUnits(ctx, pkg._id, packageItemRows[index] ?? [])),
    );

    const fulfillmentByPackage = await Promise.all(
      sorted.map((pkg) => listFulfillmentPackageBom(ctx, pkg._id)),
    );

    const typeIds = Array.from(
      new Set([
        ...packageItemRows.flat().map((row) => row.typeId),
        ...fulfillmentByPackage.flat().map((row) => row.typeId),
      ]),
    );
    const types = await Promise.all(typeIds.map((id) => ctx.db.get(id)));
    const typeById = new Map(typeIds.map((id, index) => [id, types[index] ?? null]));

    return sorted.map((pkg, index) => {
      const contents = contentsByPackage[index] ?? [];
      const fulfillment = fulfillmentByPackage[index] ?? [];
      const items = fulfillment.map((row) => ({
        typeId: row.typeId,
        quantity: row.quantity,
        type: typeById.get(row.typeId) ?? null,
      }));

      const { estimatedRentalValueUsd, estimatedSubsidizedRentalValueUsd } =
        estimatePackageRentalValueFromContents(contents);

      return {
        ...pkg,
        contents,
        items,
        estimatedRentalValueUsd,
        estimatedSubsidizedRentalValueUsd,
      };
    });
  },
});

const MIN_PACKAGE_SEARCH_CHARS = 2;
const DEFAULT_PACKAGE_SEARCH_LIMIT = 40;

async function hydratePackageOptions(ctx: QueryCtx, packages: Doc<"inventoryPackages">[]) {
  const fulfillmentRows = await Promise.all(
    packages.map((pkg) => listFulfillmentPackageBom(ctx, pkg._id)),
  );
  const typeIds = Array.from(new Set(fulfillmentRows.flat().map((row) => row.typeId)));
  const types = await Promise.all(typeIds.map((id) => ctx.db.get(id)));
  const typeById = new Map(typeIds.map((id, index) => [id, types[index] ?? null]));

  return packages.map((pkg, index) => {
    const items = (fulfillmentRows[index] ?? []).map((row) => {
      const type = typeById.get(row.typeId);
      return {
        typeId: row.typeId,
        quantity: row.quantity,
        type: type
          ? {
              name: type.name,
              model: type.model,
              subsidizedRentalPriceUsd: type.subsidizedRentalPriceUsd,
              nonSubsidizedRentalPriceUsd: type.nonSubsidizedRentalPriceUsd,
              rentalPriceUsd: type.rentalPriceUsd,
            }
          : null,
      };
    });
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

const packageWriteArgs = {
  name: v.string(),
  description: v.optional(v.string()),
  packagePriceCents: v.number(),
  subsidizedPackagePriceUsd: v.optional(v.number()),
  nonSubsidizedPackagePriceUsd: v.optional(v.number()),
  publicListing: v.optional(v.boolean()),
  publicBucket: v.optional(publicBucketValue),
  publicHeroImageUrl: v.optional(v.string()),
  publicSlug: v.optional(v.string()),
  /** Preferred write shape. */
  contents: v.optional(v.array(packageContentUnitInput)),
  /** Legacy flat BOM — converted to single-option content units when `contents` omitted. */
  items: v.optional(v.array(packageItemInput)),
};

export const create = mutation({
  args: {
    ...packageWriteArgs,
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const contents = normalizeWriteContents(args);
    await validateContents(ctx, contents);
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

    await replacePackageContents(ctx, packageId, contents, now);

    if (publicListing) {
      await scheduleInventoryPackageSiteRevalidation(ctx, packageId);
    }

    return packageId;
  },
});

export const update = mutation({
  args: {
    id: v.id("inventoryPackages"),
    ...packageWriteArgs,
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Package not found.");
    const contents = normalizeWriteContents(args);
    await validateContents(ctx, contents);

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

    const nextHeroImageUrl = normalizeOptionalAssetReference(args.publicHeroImageUrl);
    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      description: args.description?.trim(),
      packagePriceCents: args.packagePriceCents,
      subsidizedPackagePriceUsd: args.subsidizedPackagePriceUsd,
      nonSubsidizedPackagePriceUsd: args.nonSubsidizedPackagePriceUsd,
      active: args.active,
      publicListing,
      publicBucket: publicListing ? (args.publicBucket ?? existing.publicBucket) : undefined,
      publicHeroImageUrl: nextHeroImageUrl,
      publicSlug,
      updatedAt: now,
    });
    await releaseReplacedR2Reference(ctx, existing.publicHeroImageUrl, nextHeroImageUrl);

    await replacePackageContents(ctx, args.id, contents, now);

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

    await deleteOptionStructureForPackage(ctx, args.id);

    await releaseR2Keys(ctx, collectKeysFromInventoryPackage(existing));
    await ctx.db.delete(args.id);

    if (existing.publicListing) {
      await scheduleInventoryPackageSiteRevalidation(ctx, args.id);
    }
  },
});

/**
 * One-shot: fold legacy flat lines and split single-option units into one
 * included content unit per package. Exclusive units are left alone.
 * `npx convex run inventoryPackages:migrateLegacyContents`
 */
export const migrateLegacyContents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const packages = await ctx.db.query("inventoryPackages").take(500);
    let convertedPackages = 0;
    let convertedLines = 0;
    let deletedEmptyGroups = 0;
    let removedSimpleGroups = 0;

    for (const pkg of packages) {
      const result = await consolidatePackageIntoOneIncludedUnit(
        ctx,
        pkg._id,
        Date.now(),
      );
      deletedEmptyGroups += result.deletedEmptyGroups;
      removedSimpleGroups += result.removedSimpleGroups;
      if (!result.changed) continue;
      convertedPackages += 1;
      convertedLines += result.lineCount;
    }

    return {
      convertedPackages,
      convertedLines,
      deletedEmptyGroups,
      removedSimpleGroups,
    };
  },
});

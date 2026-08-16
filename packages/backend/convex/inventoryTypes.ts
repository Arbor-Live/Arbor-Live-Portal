import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import {
  normalizeOptionalAssetReference,
  normalizeResourceLinksForUpload,
} from "./lib/inventoryUpload";
import { scheduleInventoryTypeSiteRevalidation } from "./lib/scheduleSiteRevalidation";
import { ensureDefaultCategories } from "./inventoryCategories";

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
  let existing = await ctx.db
    .query("inventoryCategories")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  // Fresh local / anonymous deploys often have an empty taxonomy. Seed defaults
  // once so creating a type with a built-in key (e.g. "sound") works.
  if (!existing) {
    await ensureDefaultCategories(ctx);
    existing = await ctx.db
      .query("inventoryCategories")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
  }
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

const MAX_TYPE_OPTIONS = 2000;

function matchesInventoryTypeFilters(
  type: Doc<"inventoryTypes">,
  args: {
    capability?: string;
    manufacturer?: string;
    publicListing?: boolean;
    publicProfile?: boolean;
    search?: string;
  },
) {
  if (args.capability && !type.capabilities.includes(args.capability)) return false;
  if (args.publicListing !== undefined && Boolean(type.publicListing) !== args.publicListing) {
    return false;
  }
  if (args.publicProfile !== undefined && Boolean(type.publicProfile) !== args.publicProfile) {
    return false;
  }
  const loweredManufacturer = args.manufacturer?.trim().toLowerCase();
  if (
    loweredManufacturer &&
    (type.manufacturer ?? "").trim().toLowerCase() !== loweredManufacturer
  ) {
    return false;
  }
  const loweredSearch = args.search?.trim().toLowerCase();
  if (!loweredSearch) return true;
  return matchesInventoryTypeSearch(type, loweredSearch);
}

/**
 * Paginated types list for the types manager.
 *
 * Two modes on purpose. Unfiltered, it pages the table so the manager never
 * loads the whole catalog. Filtered, it scans a bounded window and returns the
 * matches as one finished page.
 *
 * The second mode is not an optimisation, it is a correctness fix. None of
 * these filters — substring search, a capability array membership, a
 * manufacturer or visibility equality — can be served by an index, so they can
 * only run in memory. Applying them to a *page* means the search box searches
 * the hundred rows already loaded rather than the catalog: with 289 types and
 * `initialNumItems: 100`, typing the exact name of a type created five minutes
 * ago returned "No types match the current filters" until the operator pressed
 * Load more twice. Pagination is by `_creationTime` ascending, so the rows this
 * hid were always the newest ones — the same failure #65 fixed in six other
 * admin lists.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    category: v.optional(v.string()),
    capability: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    publicListing: v.optional(v.boolean()),
    publicProfile: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    // `category` is excluded: it is served by `by_category`, so it narrows the
    // paginated query itself rather than the page it produced.
    const hasInMemoryFilter =
      Boolean(args.search?.trim()) ||
      Boolean(args.capability) ||
      Boolean(args.manufacturer?.trim()) ||
      args.publicListing !== undefined ||
      args.publicProfile !== undefined;

    if (hasInMemoryFilter) {
      const candidates = args.category
        ? await ctx.db
            .query("inventoryTypes")
            .withIndex("by_category", (q) => q.eq("category", args.category!))
            .take(MAX_TYPE_OPTIONS)
        : await ctx.db.query("inventoryTypes").take(MAX_TYPE_OPTIONS);

      const page = candidates
        .filter((type) => matchesInventoryTypeFilters(type, args))
        .sort((a, b) => a.name.localeCompare(b.name));

      // One page, already complete: `usePaginatedQuery` must not offer a Load
      // more button that would page past a result set it has all of.
      return { page, isDone: true, continueCursor: "" };
    }

    const result = args.category
      ? await ctx.db
          .query("inventoryTypes")
          .withIndex("by_category", (q) => q.eq("category", args.category!))
          .paginate(args.paginationOpts)
      : await ctx.db.query("inventoryTypes").paginate(args.paginationOpts);

    const page = result.page.sort((a, b) => a.name.localeCompare(b.name));
    return { ...result, page };
  },
});

/**
 * Bounded catalog for admin surfaces that still need a full-ish option list
 * (CSV import, packages manager filters). Pickers should use `searchOptions`.
 */
export const listOptions = query({
  args: {
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const limit = Math.min(Math.max(args.limit ?? 1500, 1), MAX_TYPE_OPTIONS);
    const types = args.category
      ? await ctx.db
          .query("inventoryTypes")
          .withIndex("by_category", (q) => q.eq("category", args.category!))
          .take(limit)
      : await ctx.db.query("inventoryTypes").take(limit);

    return types
      .map(toTypeOption)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

const MIN_SEARCH_CHARS = 2;
const DEFAULT_SEARCH_LIMIT = 40;

function toTypeOption(type: Doc<"inventoryTypes">) {
  return {
    _id: type._id,
    name: type.name,
    model: type.model,
    manufacturer: type.manufacturer,
    category: type.category,
    subsidizedRentalPriceUsd: type.subsidizedRentalPriceUsd,
    nonSubsidizedRentalPriceUsd: type.nonSubsidizedRentalPriceUsd,
    rentalPriceUsd: type.rentalPriceUsd,
  };
}

/**
 * Search-on-demand picker results. Returns [] until the query has enough chars.
 * Does not run on invoice/pull-list mount.
 */
export const searchOptions = query({
  args: {
    search: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const lowered = args.search.trim().toLowerCase();
    if (lowered.length < MIN_SEARCH_CHARS) return [];

    const limit = Math.min(Math.max(args.limit ?? DEFAULT_SEARCH_LIMIT, 1), 60);
    // Bounded scan + filter only while the user is actively searching.
    const candidates = await ctx.db.query("inventoryTypes").take(1200);
    return candidates
      .filter((type) => matchesInventoryTypeSearch(type, lowered))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit)
      .map(toTypeOption);
  },
});

/** Resolve selected picker rows (labels + rates) without loading the catalog. */
export const getOptionsByIds = query({
  args: {
    ids: v.array(v.id("inventoryTypes")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const uniqueIds = Array.from(new Set(args.ids)).slice(0, 100);
    const rows = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));
    return rows.filter((row): row is Doc<"inventoryTypes"> => Boolean(row)).map(toTypeOption);
  },
});

/** Cheap manufacturer filter options for the types manager. */
export const listManufacturers = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const types = await ctx.db.query("inventoryTypes").take(MAX_TYPE_OPTIONS);
    const manufacturers = new Set<string>();
    for (const type of types) {
      const manufacturer = type.manufacturer?.trim();
      if (manufacturer) manufacturers.add(manufacturer);
    }
    return [...manufacturers].sort((a, b) => a.localeCompare(b));
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

    const typeId = await ctx.db.insert("inventoryTypes", {
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

    if (publicListing) {
      await scheduleInventoryTypeSiteRevalidation(ctx);
    }

    return typeId;
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

    if (publicListing || existing.publicListing) {
      await scheduleInventoryTypeSiteRevalidation(ctx);
    }
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

    if (args.publicListing !== undefined) {
      await scheduleInventoryTypeSiteRevalidation(ctx);
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

    if (existing.publicListing) {
      await scheduleInventoryTypeSiteRevalidation(ctx);
    }
  },
});

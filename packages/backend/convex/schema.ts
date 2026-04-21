import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const publicBucketValue = v.union(
  v.literal("lighting"),
  v.literal("sound"),
  v.literal("environmental"),
  v.literal("staging"),
  v.literal("misc"),
);

/** Titled link for manuals, GDTF, DMX PDFs, etc. */
const resourceLinkValue = v.object({
  title: v.string(),
  url: v.string(),
});

const categoryMetadataValue = v.object({
  lighting: v.optional(
    v.object({
      gdtfUrls: v.optional(v.array(resourceLinkValue)),
      dmxModes: v.optional(v.array(v.string())),
      powerDrawWatts: v.optional(v.number()),
      wireless: v.optional(v.boolean()),
      battery: v.optional(v.boolean()),
      highCri: v.optional(v.boolean()),
    }),
  ),
});

export default defineSchema({
  inventoryCategories: defineTable({
    key: v.string(),
    label: v.string(),
    publicBucket: v.optional(publicBucketValue),
    sortOrder: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_active", ["active"]),

  capabilityDefinitions: defineTable({
    key: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_category", ["category"])
    .index("by_active", ["active"]),

  inventoryTypes: defineTable({
    name: v.string(),
    /** Public/marketing copy; markdown supported in the app UI. */
    description: v.optional(v.string()),
    category: v.string(),
    manufacturer: v.optional(v.string()),
    model: v.string(),
    msrpUsd: v.optional(v.number()),
    rentalPriceUsd: v.optional(v.number()),
    subsidizedRentalPriceUsd: v.optional(v.number()),
    nonSubsidizedRentalPriceUsd: v.optional(v.number()),
    manualUrls: v.array(resourceLinkValue),
    tips: v.optional(v.string()),
    capabilities: v.array(v.string()),
    iconImageUrl: v.optional(v.string()),
    promoImageUrl: v.optional(v.string()),
    categoryMetadata: v.optional(categoryMetadataValue),
    publicListing: v.optional(v.boolean()),
    publicProfile: v.optional(v.boolean()),
    publicSlug: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_category", ["category"])
    .index("by_category_and_name", ["category", "name"])
    .index("by_publicSlug", ["publicSlug"]),

  storageLocations: defineTable({
    name: v.string(),
    parentId: v.optional(v.id("storageLocations")),
    path: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_parentId", ["parentId"])
    .index("by_path", ["path"]),

  /** Singleton row: global copy for public /e/[assetId] Lost & Found (staff-edited). */
  lostFoundSettings: defineTable({
    instructions: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    infoUrl: v.optional(v.string()),
    updatedAt: v.number(),
  }),

  inventoryItems: defineTable({
    assetId: v.string(),
    serialNumber: v.optional(v.string()),
    typeId: v.id("inventoryTypes"),
    storageLocationId: v.optional(v.id("storageLocations")),
    containedInAssetId: v.optional(v.id("inventoryItems")),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_assetId", ["assetId"])
    .index("by_typeId", ["typeId"])
    .index("by_storageLocationId", ["storageLocationId"])
    .index("by_containedInAssetId", ["containedInAssetId"])
    .index("by_serialNumber", ["serialNumber"]),

  inventoryPackages: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    packagePriceCents: v.number(),
    subsidizedPackagePriceUsd: v.optional(v.number()),
    nonSubsidizedPackagePriceUsd: v.optional(v.number()),
    active: v.boolean(),
    publicListing: v.optional(v.boolean()),
    /** Browse section on public package pages; required when publicListing is true (set via admin UI). */
    publicBucket: v.optional(publicBucketValue),
    publicHeroImageUrl: v.optional(v.string()),
    publicSlug: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_active", ["active"])
    .index("by_publicSlug", ["publicSlug"]),

  inventoryPackageItems: defineTable({
    packageId: v.id("inventoryPackages"),
    typeId: v.id("inventoryTypes"),
    quantity: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_packageId", ["packageId"])
    .index("by_typeId", ["typeId"])
    .index("by_package_and_type", ["packageId", "typeId"]),
});

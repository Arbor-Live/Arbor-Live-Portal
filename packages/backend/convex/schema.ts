import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

export default defineSchema({
  inventoryCategories: defineTable({
    key: v.string(),
    label: v.string(),
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
    category: v.string(),
    manufacturer: v.optional(v.string()),
    model: v.string(),
    msrpUsd: v.optional(v.number()),
    rentalPriceUsd: v.optional(v.number()),
    subsidizedRentalPriceUsd: v.optional(v.number()),
    nonSubsidizedRentalPriceUsd: v.optional(v.number()),
    manualUrls: v.array(v.string()),
    tips: v.optional(v.string()),
    capabilities: v.array(v.string()),
    iconImageUrl: v.optional(v.string()),
    promoImageUrl: v.optional(v.string()),
    categoryMetadata: v.optional(categoryMetadataValue),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_category", ["category"])
    .index("by_category_and_name", ["category", "name"]),

  storageLocations: defineTable({
    name: v.string(),
    parentId: v.optional(v.id("storageLocations")),
    path: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_parentId", ["parentId"])
    .index("by_path", ["path"]),

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
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_active", ["active"]),

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

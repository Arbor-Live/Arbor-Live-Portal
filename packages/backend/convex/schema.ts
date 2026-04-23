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

const invoiceGroupTypeValue = v.union(
  v.literal("vso"),
  v.literal("house"),
  v.literal("department"),
  v.literal("individual"),
);

const invoiceStatusValue = v.union(
  v.literal("draft"),
  v.literal("finalized"),
  v.literal("void"),
);

const equipmentPricingModeValue = v.union(v.literal("subsidized"), v.literal("nonSubsidized"));
const crewRateModeValue = v.union(v.literal("normal"), v.literal("ot"));
const discountTypeValue = v.union(v.literal("amount"), v.literal("percent"));

const invoiceLineSectionValue = v.union(
  v.literal("equipment_package"),
  v.literal("equipment_type"),
  v.literal("external_rental"),
  v.literal("artist"),
  v.literal("crew"),
  v.literal("fee"),
);

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

  invoiceGroups: defineTable({
    name: v.string(),
    type: invoiceGroupTypeValue,
    active: v.boolean(),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_active", ["active"])
    .index("by_lastUsedAt", ["lastUsedAt"])
    .index("by_type_and_name", ["type", "name"]),

  invoiceContacts: defineTable({
    groupId: v.optional(v.id("invoiceGroups")),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    active: v.boolean(),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_groupId", ["groupId"])
    .index("by_active", ["active"])
    .index("by_lastUsedAt", ["lastUsedAt"])
    .index("by_groupId_and_name", ["groupId", "name"]),

  invoiceSettings: defineTable({
    key: v.string(),
    crewNormalRateUsd: v.optional(v.number()),
    crewOtRateUsd: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  invoiceFeeDefinitions: defineTable({
    key: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    defaultAmountUsd: v.optional(v.number()),
    active: v.boolean(),
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_active", ["active"])
    .index("by_sortOrder", ["sortOrder"]),

  invoices: defineTable({
    invoiceNumber: v.string(),
    status: invoiceStatusValue,
    issueDate: v.string(),
    dueDate: v.optional(v.string()),
    managerUserId: v.string(),
    managerName: v.string(),
    managerEmail: v.optional(v.string()),

    groupId: v.optional(v.id("invoiceGroups")),
    contactId: v.optional(v.id("invoiceContacts")),
    clientGroupName: v.optional(v.string()),
    clientGroupType: v.optional(invoiceGroupTypeValue),
    clientContactName: v.optional(v.string()),
    clientEmail: v.optional(v.string()),
    clientPhone: v.optional(v.string()),
    clientAddressLine1: v.optional(v.string()),
    clientAddressLine2: v.optional(v.string()),
    clientCity: v.optional(v.string()),
    clientState: v.optional(v.string()),
    clientPostalCode: v.optional(v.string()),

    equipmentPricingMode: equipmentPricingModeValue,
    crewRateMode: crewRateModeValue,
    discountType: discountTypeValue,
    discountValue: v.number(),
    discountAmountUsd: v.number(),
    discountWarning: v.optional(v.string()),

    equipmentSubtotalUsd: v.number(),
    externalRentalsSubtotalUsd: v.number(),
    artistsSubtotalUsd: v.number(),
    crewSubtotalUsd: v.number(),
    feesSubtotalUsd: v.number(),
    subtotalUsd: v.number(),
    totalUsd: v.number(),

    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_invoiceNumber", ["invoiceNumber"])
    .index("by_status", ["status"])
    .index("by_managerUserId", ["managerUserId"])
    .index("by_issueDate", ["issueDate"])
    .index("by_createdAt", ["createdAt"]),

  invoiceLineItems: defineTable({
    invoiceId: v.id("invoices"),
    section: invoiceLineSectionValue,
    order: v.number(),
    provider: v.optional(v.string()),
    label: v.string(),
    notes: v.optional(v.string()),
    quantity: v.number(),
    rateUsd: v.number(),
    amountUsd: v.number(),
    packageId: v.optional(v.id("inventoryPackages")),
    typeId: v.optional(v.id("inventoryTypes")),
    feeDefinitionId: v.optional(v.id("invoiceFeeDefinitions")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_invoiceId", ["invoiceId"])
    .index("by_invoiceId_and_order", ["invoiceId", "order"])
    .index("by_invoiceId_and_section", ["invoiceId", "section"]),

  invoiceExports: defineTable({
    invoiceId: v.id("invoices"),
    format: v.union(v.literal("pdf")),
    generatedByUserId: v.string(),
    generatedByName: v.optional(v.string()),
    fileName: v.string(),
    downloadUrl: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_invoiceId", ["invoiceId"])
    .index("by_invoiceId_and_createdAt", ["invoiceId", "createdAt"]),
});

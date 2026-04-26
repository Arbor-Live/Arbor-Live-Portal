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
const clientApprovalStatusValue = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("changes_requested"),
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

const eventStatusValue = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("cancelled"),
);

const eventVisibilityValue = v.union(v.literal("internal"), v.literal("public"));

const eventTimelineBlockTypeValue = v.union(
  v.literal("setup"),
  v.literal("show"),
  v.literal("strike"),
  v.literal("custom"),
);

const eventAssignmentTypeValue = v.union(
  v.literal("event_manager"),
  v.literal("day_of_lead"),
  v.literal("crew"),
  v.literal("performer"),
  v.literal("support"),
  v.literal("contact"),
);

const eventArtifactTypeValue = v.union(
  v.literal("note"),
  v.literal("instruction"),
  v.literal("document"),
  v.literal("pull_list"),
);

const eventExpenseStatusValue = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("paid"),
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
    termsAndConditionsMarkdown: v.optional(v.string()),
    termsVersion: v.optional(v.string()),
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

  invoiceCounters: defineTable({
    key: v.string(),
    nextNumber: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  invoiceTerms: defineTable({
    label: v.string(),
    version: v.string(),
    markdown: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_label", ["label"]),

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
    termsId: v.optional(v.id("invoiceTerms")),
    additionalTermsMarkdown: v.optional(v.string()),

    clientApprovalStatus: v.optional(clientApprovalStatusValue),
    publicApprovalToken: v.optional(v.string()),
    publicApprovalTokenExpiresAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    changesRequestedAt: v.optional(v.number()),
    clientApprovalNote: v.optional(v.string()),
    termsVersionAccepted: v.optional(v.string()),
    termsAcceptedAt: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_invoiceNumber", ["invoiceNumber"])
    .index("by_status", ["status"])
    .index("by_clientApprovalStatus", ["clientApprovalStatus"])
    .index("by_publicApprovalToken", ["publicApprovalToken"])
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

  events: defineTable({
    title: v.string(),
    status: eventStatusValue,
    visibility: eventVisibilityValue,
    invoiceId: v.optional(v.id("invoices")),
    publicToken: v.optional(v.string()),
    startAt: v.number(),
    endAt: v.number(),
    timezone: v.string(),
    spansMultipleDays: v.boolean(),
    setupOnly: v.boolean(),
    strikeOnly: v.boolean(),
    requiresShowWindow: v.boolean(),
    venueName: v.optional(v.string()),
    eventType: v.optional(v.string()),
    teamsInterested: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    host: v.optional(v.string()),
    expectedTurnout: v.optional(v.number()),
    budgetUsd: v.optional(v.number()),
    dayOfLeadUserId: v.optional(v.string()),
    eventManagerUserId: v.optional(v.string()),
    crewCostUsd: v.optional(v.number()),
    bandsCostUsd: v.optional(v.number()),
    externalRentalsCostUsd: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_visibility", ["visibility"])
    .index("by_invoiceId", ["invoiceId"])
    .index("by_publicToken", ["publicToken"])
    .index("by_startAt", ["startAt"])
    .index("by_createdAt", ["createdAt"]),

  userCompensationRates: defineTable({
    userId: v.string(),
    hourlyRateUsd: v.number(),
    updatedByUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_updatedAt", ["updatedAt"]),

  eventScheduleBlocks: defineTable({
    eventId: v.id("events"),
    blockType: eventTimelineBlockTypeValue,
    label: v.string(),
    dayIndex: v.number(),
    startsAt: v.number(),
    endsAt: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_dayIndex", ["eventId", "dayIndex"])
    .index("by_eventId_and_startsAt", ["eventId", "startsAt"]),

  eventExpenseReports: defineTable({
    eventId: v.id("events"),
    title: v.string(),
    status: eventExpenseStatusValue,
    totalHours: v.optional(v.number()),
    totalAmountUsd: v.optional(v.number()),
    notes: v.optional(v.string()),
    submittedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_status", ["status"])
    .index("by_eventId_and_status", ["eventId", "status"]),

  eventCrewShifts: defineTable({
    eventId: v.id("events"),
    scheduleBlockId: v.optional(v.id("eventScheduleBlocks")),
    expenseReportId: v.optional(v.id("eventExpenseReports")),
    role: v.string(),
    personName: v.optional(v.string()),
    userId: v.optional(v.string()),
    callTime: v.optional(v.number()),
    startsAt: v.number(),
    endsAt: v.number(),
    hours: v.number(),
    postedToExpense: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_startsAt", ["eventId", "startsAt"])
    .index("by_scheduleBlockId", ["scheduleBlockId"])
    .index("by_expenseReportId", ["expenseReportId"]),

  eventPeopleAssignments: defineTable({
    eventId: v.id("events"),
    assignmentType: eventAssignmentTypeValue,
    roleLabel: v.optional(v.string()),
    personName: v.string(),
    userId: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_assignmentType", ["assignmentType"])
    .index("by_eventId_and_assignmentType", ["eventId", "assignmentType"]),

  eventArtifacts: defineTable({
    eventId: v.id("events"),
    artifactType: eventArtifactTypeValue,
    title: v.string(),
    markdown: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    storageFileId: v.optional(v.id("_storage")),
    version: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_artifactType", ["artifactType"])
    .index("by_eventId_and_artifactType", ["eventId", "artifactType"]),
});

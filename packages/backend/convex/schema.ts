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
const crewRateModeValue = v.union(
  v.literal("normal"),
  v.literal("lead"),
  v.literal("custom"),
  v.literal("ot"),
);
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
  v.literal("tentative"),
  v.literal("logistics"),
  v.literal("scheduling"),
  v.literal("ready"),
  v.literal("cancelled"),
  v.literal("draft"),
  v.literal("active"),
  v.literal("completed"),
);

const eventVisibilityValue = v.union(
  v.literal("public"),
  v.literal("internal"),
  v.literal("informational"),
);

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

const userTeamValue = v.union(
  v.literal("Sound"),
  v.literal("Lights"),
  v.literal("Design"),
  v.literal("Marketing"),
  v.literal("Operations"),
);
const userVerticalValue = v.union(
  v.literal("Operations"),
  v.literal("Crew"),
  v.literal("Trivia"),
  v.literal("Marketing"),
);

const userDisciplineValue = v.union(v.literal("Sound"), v.literal("Lights"), v.literal("Design"));

const marketingDesignLinkValue = v.object({
  label: v.string(),
  url: v.string(),
});

const marketingDesignStatusValue = v.union(
  v.literal("draft"),
  v.literal("ready"),
  v.literal("published"),
);

const marketingPublishJobStatusValue = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
);

const organizationTypeValue = v.union(v.literal("arbor_internal"), v.literal("band"), v.literal("dj"));

const marketingPostKindValue = v.union(v.literal("case_study"), v.literal("blog"));

const marketingFeaturedStatValue = v.object({
  label: v.string(),
  value: v.string(),
});

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

const rentalFulfillmentModeValue = v.union(v.literal("delivery"), v.literal("will_call"));

const crewAvailabilityResponseStatusValue = v.union(
  v.literal("yes"),
  v.literal("partial"),
  v.literal("only_if_necessary"),
  v.literal("no"),
);

const crewAvailabilityPartialWindowValue = v.object({
  scheduleBlockId: v.optional(v.id("eventScheduleBlocks")),
  startsAt: v.number(),
  endsAt: v.number(),
  notes: v.optional(v.string()),
});

const eventPullListSourceValue = v.union(
  v.literal("manual"),
  v.literal("invoice_package"),
  v.literal("invoice_type"),
);

const eventPullListLineKindValue = v.union(v.literal("type"), v.literal("package"));

const immichAlbumEntityTypeValue = v.union(v.literal("band"), v.literal("event"));

const immichAssetTypeValue = v.union(v.literal("IMAGE"), v.literal("VIDEO"));

const eventBandParticipationRoleValue = v.union(
  v.literal("headliner"),
  v.literal("support"),
  v.literal("other"),
);

const paymentProofMethodValue = v.union(
  v.literal("assu_epay"),
  v.literal("ijournal"),
  v.literal("granted_transfer"),
);

const paymentProofSubmissionStatusValue = v.union(
  v.literal("active"),
  v.literal("invalidated"),
);

const bandPaymentPricingModeValue = v.union(
  v.literal("per_member_hourly"),
  v.literal("fixed_total"),
);

const bandPaymentStatusValue = v.union(
  v.literal("draft"),
  v.literal("pending_payee"),
  v.literal("pending_email"),
  v.literal("awaiting_confirmation"),
  v.literal("confirmed"),
  v.literal("paid"),
  v.literal("cancelled"),
);

const dashboardKeyValue = v.union(v.literal("crewHome"), v.literal("adminHome"));

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
    .index("by_publicSlug", ["publicSlug"])
    .index("by_publicListing", ["publicListing"]),

  storageLocations: defineTable({
    name: v.string(),
    parentId: v.optional(v.id("storageLocations")),
    path: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_parentId", ["parentId"])
    .index("by_path", ["path"]),

  venues: defineTable({
    name: v.string(),
    nicknames: v.optional(v.array(v.string())),
    parentId: v.optional(v.id("venues")),
    path: v.string(),
    kind: v.union(v.literal("building"), v.literal("indoor"), v.literal("outdoor")),
    venueType: v.string(),
    capacity: v.optional(v.number()),
    address: v.optional(v.string()),
    googleMapsUrl: v.optional(v.string()),
    notesJson: v.optional(v.string()),
    circuits: v.optional(
      v.array(
        v.object({
          label: v.string(),
          voltage: v.number(),
          amperage: v.number(),
        }),
      ),
    ),
    documentationLinks: v.optional(
      v.array(
        v.object({
          title: v.string(),
          url: v.string(),
        }),
      ),
    ),
    files: v.optional(
      v.array(
        v.object({
          title: v.string(),
          r2Key: v.string(),
          fileName: v.string(),
          contentType: v.string(),
        }),
      ),
    ),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_parentId", ["parentId"])
    .index("by_path", ["path"])
    .index("by_kind", ["kind"]),

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
    .index("by_publicSlug", ["publicSlug"])
    .index("by_publicListing", ["publicListing"]),

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
    equipmentPricingMode: v.optional(equipmentPricingModeValue),
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
    /** @deprecated Migrated to firstName/lastName. */
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    active: v.boolean(),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_groupId", ["groupId"])
    .index("by_active", ["active"])
    .index("by_lastUsedAt", ["lastUsedAt"])
    .index("by_groupId_and_lastName", ["groupId", "lastName"]),

  invoiceSettings: defineTable({
    key: v.string(),
    crewNormalRateUsd: v.optional(v.number()),
    crewLeadRateUsd: v.optional(v.number()),
    crewOtRateUsd: v.optional(v.number()),
    crewCostBufferPercent: v.optional(v.number()),
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
    termsIds: v.optional(v.array(v.id("invoiceTerms"))),
    /** @deprecated Use termsIds. Kept for existing invoices until backfilled. */
    termsId: v.optional(v.id("invoiceTerms")),
    additionalTermsMarkdown: v.optional(v.string()),

    clientApprovalStatus: v.optional(clientApprovalStatusValue),
    publicApprovalToken: v.optional(v.string()),
    publicApprovalTokenExpiresAt: v.optional(v.number()),
    sourceEventRequestId: v.optional(v.id("eventRequests")),
    clientReviewReadyAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    changesRequestedAt: v.optional(v.number()),
    clientApprovalNote: v.optional(v.string()),
    clientApprovalSignedName: v.optional(v.string()),
    paymentFinanceContactEmail: v.optional(v.string()),
    clientIsPaymentSubmitter: v.optional(v.boolean()),
    paymentSubmitterName: v.optional(v.string()),
    paymentSubmitterEmail: v.optional(v.string()),
    payingPartyNotifiedEmail: v.optional(v.string()),
    payingPartyNotifiedAt: v.optional(v.number()),
    termsVersionAccepted: v.optional(v.string()),
    termsAcceptedAt: v.optional(v.number()),

    paymentReceivedAt: v.optional(v.number()),
    paymentReceivedByUserId: v.optional(v.string()),
    paymentReceiptStorageFileId: v.optional(v.id("_storage")),

    billableOccurrenceCountAtSave: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_invoiceNumber", ["invoiceNumber"])
    .index("by_status", ["status"])
    .index("by_clientApprovalStatus", ["clientApprovalStatus"])
    .index("by_publicApprovalToken", ["publicApprovalToken"])
    .index("by_sourceEventRequestId", ["sourceEventRequestId"])
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
    equipmentQuantityBasis: v.optional(v.union(v.literal("total"), v.literal("per_occurrence"))),
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

  eventSeries: defineTable({
    title: v.string(),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("ended")),
    anchorStartAt: v.number(),
    anchorEndAt: v.number(),
    intervalWeeks: v.number(),
    occurrenceCount: v.optional(v.number()),
    seriesEndAt: v.optional(v.number()),
    timezone: v.string(),
    requiresShowWindow: v.boolean(),
    venueId: v.optional(v.id("venues")),
    venueName: v.optional(v.string()),
    eventType: v.optional(v.string()),
    teamsInterested: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    hostGroupId: v.optional(v.id("invoiceGroups")),
    host: v.optional(v.string()),
    expectedTurnout: v.optional(v.number()),
    budgetUsd: v.optional(v.number()),
    occurrenceBandsCostUsd: v.optional(v.number()),
    occurrenceExternalRentalsCostUsd: v.optional(v.number()),
    occurrenceOtherCostUsd: v.optional(v.number()),
    occurrenceBudgetCrewCostUsd: v.optional(v.number()),
    budgetCrewHourlyRateUsd: v.optional(v.number()),
    seriesBandsCostUsd: v.optional(v.number()),
    seriesExternalRentalsCostUsd: v.optional(v.number()),
    seriesOtherCostUsd: v.optional(v.number()),
    dayOfLeadUserId: v.optional(v.string()),
    eventManagerUserId: v.optional(v.string()),
    rentalFulfillmentMode: v.optional(rentalFulfillmentModeValue),
    notes: v.optional(v.string()),
    blockTemplates: v.optional(
      v.array(
        v.object({
          blockType: eventTimelineBlockTypeValue,
          label: v.string(),
          dayIndex: v.number(),
          offsetMs: v.number(),
          durationMs: v.number(),
          notes: v.optional(v.string()),
        }),
      ),
    ),
    shiftTemplates: v.optional(
      v.array(
        v.object({
          role: v.string(),
          blockTemplateIndex: v.number(),
          offsetMs: v.number(),
          durationMs: v.number(),
          estimatedHourlyRateUsd: v.optional(v.number()),
          notes: v.optional(v.string()),
        }),
      ),
    ),
    invoiceId: v.optional(v.id("invoices")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"])
    .index("by_invoiceId", ["invoiceId"])
    .index("by_venueId", ["venueId"])
    .index("by_hostGroupId", ["hostGroupId"]),

  events: defineTable({
    title: v.string(),
    status: eventStatusValue,
    visibility: eventVisibilityValue,
    invoiceId: v.optional(v.id("invoices")),
    publicToken: v.optional(v.string()),
    seriesId: v.optional(v.id("eventSeries")),
    occurrenceIndex: v.optional(v.number()),
    seriesDetached: v.optional(v.boolean()),
    startAt: v.number(),
    endAt: v.number(),
    timezone: v.string(),
    spansMultipleDays: v.boolean(),
    setupOnly: v.boolean(),
    strikeOnly: v.boolean(),
    requiresShowWindow: v.boolean(),
    venueId: v.optional(v.id("venues")),
    venueName: v.optional(v.string()),
    eventType: v.optional(v.string()),
    teamsInterested: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    hostGroupId: v.optional(v.id("invoiceGroups")),
    host: v.optional(v.string()),
    expectedTurnout: v.optional(v.number()),
    budgetUsd: v.optional(v.number()),
    dayOfLeadUserId: v.optional(v.string()),
    eventManagerUserId: v.optional(v.string()),
    otPremium: v.optional(v.boolean()),
    crewCostBufferPercent: v.optional(v.number()),
    crewCostUsd: v.optional(v.number()),
    bandsCostUsd: v.optional(v.number()),
    externalRentalsCostUsd: v.optional(v.number()),
    otherCostUsd: v.optional(v.number()),
    rentalFulfillmentMode: v.optional(rentalFulfillmentModeValue),
    notes: v.optional(v.string()),
    sourceEventRequestId: v.optional(v.id("eventRequests")),

    /** Event add-ons (per-event feature toggles). Open Mic is the first add-on. */
    openMicEnabled: v.optional(v.boolean()),
    /** Runner operational state for the Open Mic add-on. Drives the public
     *  sign-up window (scheduled/live) and runner UI gating. Independent from
     *  the event's own lifecycle status so running the queue never fights the
     *  broader event workflow. */
    openMicStatus: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("live"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
    /** Free-form crew notes shown on the Open Mic runner and public sign-up. */
    openMicNotes: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_visibility", ["visibility"])
    .index("by_invoiceId", ["invoiceId"])
    .index("by_publicToken", ["publicToken"])
    .index("by_startAt", ["startAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_seriesId_and_occurrenceIndex", ["seriesId", "occurrenceIndex"])
    .index("by_sourceEventRequestId", ["sourceEventRequestId"])
    .index("by_openMicEnabled_and_startAt", ["openMicEnabled", "startAt"])
    .index("by_venueId", ["venueId"])
    .index("by_hostGroupId", ["hostGroupId"]),

  userCompensationRates: defineTable({
    userId: v.string(),
    hourlyRateUsd: v.number(),
    updatedByUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_updatedAt", ["updatedAt"]),

  userAdminProfiles: defineTable({
    userId: v.string(),
    title: v.optional(v.string()),
    phone: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    active: v.boolean(),
    /** @deprecated Use verticals + disciplines. Kept for migration reads. */
    teams: v.optional(v.array(userTeamValue)),
    verticals: v.optional(v.array(userVerticalValue)),
    disciplines: v.optional(v.array(userDisciplineValue)),
    /** When true, user appears on the public /crew page (opt-in). */
    showOnPublicCrewPage: v.optional(v.boolean()),
    /** Admin-written blurb shown on the public /crew page. */
    publicCrewDescription: v.optional(v.string()),
    calendarInviteEmail: v.optional(v.string()),
    defaultOrganizationId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_active", ["active"])
    .index("by_defaultOrganizationId", ["defaultOrganizationId"]),

  userOrganizationMemberships: defineTable({
    userId: v.string(),
    organizationId: v.string(),
    role: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_organizationId", ["organizationId"])
    .index("by_userId_and_organizationId", ["userId", "organizationId"]),

  organizationProfiles: defineTable({
    organizationId: v.string(),
    organizationType: organizationTypeValue,
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    performerHourlyRateUsd: v.optional(v.number()),
    designatedPayeeUserId: v.optional(v.string()),
    designatedPayeeName: v.optional(v.string()),
    designatedPayeeEmail: v.optional(v.string()),
    designatedPayeeMailingAddress: v.optional(v.string()),
    publicWebsiteUrl: v.optional(v.string()),
    publicInstagramUrl: v.optional(v.string()),
    publicYoutubeUrl: v.optional(v.string()),
    publicListing: v.optional(v.boolean()),
    publicSlug: v.optional(v.string()),
    publicHeroImageUrl: v.optional(v.string()),
    updatedAt: v.number(),

    //expanding orgs to include the additional fields for bands and djs
    orgCreationTime: v.optional(v.number()),
    techRiderURL: v.optional(v.string()),
    numShowsRan: v.optional(v.number()),
    demoURL: v.optional(v.string()),
    genres: v.optional(v.array(v.string())),
    mainContactName: v.optional(v.string()),
    mainContactEmail: v.optional(v.string()),
    mainContactPhone: v.optional(v.string()),
    status: v.optional(v.string()), //e.g. active, disbanded, inactive, unknown
    bandMembers: v.optional(v.array(v.string())), //members of the band but arent necessarily users on the website.  
    oneLiner: v.optional(v.string()), //short description of the band/dj for public listing page

  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationType", ["organizationType"])
    .index("by_publicSlug", ["publicSlug"])
    //to allow searching for orgs by display name (mainly for band/dj search)
    .index("by_displayName", ["displayName"]),

  userActiveOrganizations: defineTable({
    userId: v.string(),
    organizationId: v.string(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_organizationId", ["organizationId"]),

  /** Crew (arbor_internal) onboarding checklist — one row per user. */
  userOnboarding: defineTable({
    userId: v.string(),
    flow: v.literal("crew"),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("waived"),
    ),
    profileCompletedAt: v.optional(v.number()),
    whatsappAcknowledgedAt: v.optional(v.number()),
    instagramAcknowledgedAt: v.optional(v.number()),
    hasFederalWorkStudy: v.optional(v.union(v.boolean(), v.null())),
    fwsAcknowledgedAt: v.optional(v.number()),
    narcanCompletedAt: v.optional(v.number()),
    soberMonitorCompletedAt: v.optional(v.number()),
    emergencySopsAcknowledgedAt: v.optional(v.number()),
    crewExpectationsAcknowledgedAt: v.optional(v.number()),
    liftingCompletedAt: v.optional(v.number()),
    hasValidDriversLicense: v.optional(v.boolean()),
    cartTrainingCompletedAt: v.optional(v.number()),
    oseHiringFormCompletedAt: v.optional(v.number()),
    timecardAcknowledgedAt: v.optional(v.number()),
    agreedToOnboardingDocAt: v.optional(v.number()),
    signatureLegalName: v.optional(v.string()),
    signatureUserAgent: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    waivedAt: v.optional(v.number()),
    waivedByUserId: v.optional(v.string()),
    lastReminderSentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"]),

  /** Band/DJ org onboarding checklist — one row per organization. */
  organizationOnboarding: defineTable({
    organizationId: v.string(),
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("waived"),
    ),
    identityCompletedAt: v.optional(v.number()),
    heroCompletedAt: v.optional(v.number()),
    socialsCompletedAt: v.optional(v.number()),
    ratesPayeeCompletedAt: v.optional(v.number()),
    membersCompletedAt: v.optional(v.number()),
    paymentExplainedAt: v.optional(v.number()),
    soloAcknowledgedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    waivedAt: v.optional(v.number()),
    waivedByUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]).index("by_status", ["status"]),

  dashboardPreferences: defineTable({
    userId: v.string(),
    dashboardKey: dashboardKeyValue,
    widgetOrder: v.array(v.string()),
    hiddenWidgetIds: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_dashboardKey", ["userId", "dashboardKey"]),

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
    /** Trainee shifts link to a crew application instead of a portal user. */
    crewApplicationId: v.optional(v.id("crewApplications")),
    callTime: v.optional(v.number()),
    startsAt: v.number(),
    endsAt: v.number(),
    hours: v.number(),
    estimatedHourlyRateUsd: v.optional(v.number()),
    postedToExpense: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_startsAt", ["eventId", "startsAt"])
    .index("by_scheduleBlockId", ["scheduleBlockId"])
    .index("by_expenseReportId", ["expenseReportId"])
    .index("by_userId_and_startsAt", ["userId", "startsAt"])
    .index("by_crewApplicationId", ["crewApplicationId"]),

  eventCrewMediaStatus: defineTable({
    eventId: v.id("events"),
    userId: v.string(),
    status: v.union(v.literal("uploaded"), v.literal("no_media")),
    resolvedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_eventId_and_userId", ["eventId", "userId"]),

  eventCrewAvailabilityResponses: defineTable({
    eventId: v.id("events"),
    userId: v.string(),
    responseStatus: crewAvailabilityResponseStatusValue,
    partialWindows: v.optional(v.array(crewAvailabilityPartialWindowValue)),
    notes: v.optional(v.string()),
    respondedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_userId", ["userId"])
    .index("by_eventId_and_userId", ["eventId", "userId"]),

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

  immichAlbumLinks: defineTable({
    entityType: immichAlbumEntityTypeValue,
    entityId: v.string(),
    immichAlbumId: v.string(),
    albumName: v.string(),
    sharedLinkId: v.optional(v.string()),
    sharedLinkKey: v.optional(v.string()),
    shareUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_entityType_and_entityId", ["entityType", "entityId"])
    .index("by_immichAlbumId", ["immichAlbumId"]),

  immichAssetRecords: defineTable({
    albumLinkId: v.id("immichAlbumLinks"),
    immichAssetId: v.string(),
    originalFileName: v.string(),
    type: immichAssetTypeValue,
    createdAt: v.number(),
  })
    .index("by_albumLinkId", ["albumLinkId"])
    .index("by_immichAssetId", ["immichAssetId"]),

  eventBandParticipations: defineTable({
    eventId: v.id("events"),
    organizationId: v.string(),
    role: eventBandParticipationRoleValue,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_organizationId", ["organizationId"])
    .index("by_eventId_and_organizationId", ["eventId", "organizationId"]),

  // Phase 2: eventPullListAssetAssignments (pullListItemId, inventoryItemId, checkedOutAt)
  pendingUserInvites: defineTable({
    invitationId: v.string(),
    token: v.string(),
    email: v.string(),
    organizationId: v.string(),
    role: v.string(),
    /** @deprecated Use verticals + disciplines on invite acceptance. */
    teams: v.optional(v.array(v.string())),
    verticals: v.optional(v.array(v.string())),
    disciplines: v.optional(v.array(v.string())),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_invitationId", ["invitationId"]),

  emailNotifications: defineTable({
    template: v.union(
      v.literal("event_cancelled"),
      v.literal("schedule_published"),
      v.literal("crew_scheduled"),
      v.literal("crew_unscheduled"),
      v.literal("schedule_reminder"),
      v.literal("user_invite"),
      v.literal("password_reset"),
      v.literal("email_verification"),
      v.literal("change_email_confirmation"),
      v.literal("booking_request_received"),
      v.literal("booking_quote_ready"),
      v.literal("payment_proof_reminder"),
      v.literal("payment_proof_submitted"),
      v.literal("paying_party_added"),
      v.literal("band_payment_confirmation"),
      v.literal("band_payment_completed"),
      v.literal("band_payment_payee_required"),
      v.literal("onboarding_completed"),
      v.literal("onboarding_reminder"),
      v.literal("band_application_received"),
      v.literal("band_application_approved"),
      v.literal("band_application_declined"),
      v.literal("band_application_confirmation"),
      v.literal("crew_application_received"),
      v.literal("crew_application_closed"),
      v.literal("crew_application_confirmation"),
      v.literal("crew_trainee_intro"),
    ),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
    to: v.string(),
    cc: v.optional(v.array(v.string())),
    replyTo: v.optional(v.array(v.string())),
    subject: v.string(),
    eventId: v.optional(v.id("events")),
    idempotencyKey: v.string(),
    /** Stable key for coalescing rapid schedule/crew updates into one send. */
    debounceKey: v.optional(v.string()),
    sendGeneration: v.optional(v.number()),
    readyAt: v.optional(v.number()),
    payload: v.any(),
    resendId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_eventId", ["eventId"])
    .index("by_debounceKey_and_status", ["debounceKey", "status"]),


  eventRequests: defineTable({
    status: v.union(
      v.literal("submitted"),
      v.literal("in_review"),
      v.literal("converted"),
      v.literal("declined"),
    ),
    requestNumber: v.optional(v.string()),
    publicToken: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    phone: v.string(),
    organization: v.optional(v.string()),
    sponsorType: v.string(),
    invoiceContactId: v.optional(v.id("invoiceContacts")),
    invoiceGroupId: v.optional(v.id("invoiceGroups")),
    requestContext: v.optional(v.string()),
    venueId: v.optional(v.id("venues")),
    venueName: v.optional(v.string()),
    venueAddress: v.optional(v.string()),
    eventDateText: v.string(),
    eventStartTimeText: v.string(),
    eventEndTimeText: v.string(),
    earliestSetupText: v.string(),
    eventStartAtMs: v.optional(v.number()),
    eventEndAtMs: v.optional(v.number()),
    setupAtMs: v.optional(v.number()),
    flexibleSetupTime: v.optional(v.boolean()),
    endsNextDay: v.optional(v.boolean()),
    additionalShowDates: v.optional(v.array(v.string())),
    eventScheduleText: v.optional(v.string()),
    showSlots: v.optional(
      v.array(
        v.object({
          date: v.string(),
          startTime: v.string(),
          endTime: v.string(),
          startAtMs: v.number(),
          endAtMs: v.number(),
          endsNextDay: v.boolean(),
        }),
      ),
    ),
    eventName: v.optional(v.string()),
    eventCategory: v.string(),
    crewOrRental: v.optional(v.string()),
    servicesNeeded: v.array(v.string()),
    productionTier: v.optional(v.string()),
    eventDescription: v.optional(v.string()),
    expectedTurnout: v.number(),
    existingEquipment: v.optional(v.string()),
    lightingPreference: v.optional(v.string()),
    additionalNotes: v.optional(v.string()),
    convertedEventId: v.optional(v.id("events")),
    convertedEventIds: v.optional(v.array(v.id("events"))),
    linkedInvoiceId: v.optional(v.id("invoices")),
    reviewedByUserId: v.optional(v.string()),
    staffNotes: v.optional(v.string()),
    submittedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_and_submittedAt", ["status", "submittedAt"])
    .index("by_email", ["email"])
    .index("by_publicToken", ["publicToken"])
    .index("by_requestNumber", ["requestNumber"])
    .index("by_linkedInvoiceId", ["linkedInvoiceId"])
    .index("by_venueId", ["venueId"]),

  eventBandPayments: defineTable({
    eventId: v.id("events"),
    organizationId: v.string(),
    pricingMode: bandPaymentPricingModeValue,
    ratePerMemberPerHourUsd: v.optional(v.number()),
    performanceHours: v.optional(v.number()),
    memberCount: v.optional(v.number()),
    totalUsd: v.number(),
    designatedPayeeName: v.optional(v.string()),
    designatedPayeeEmail: v.optional(v.string()),
    designatedPayeeUserId: v.optional(v.string()),
    designatedPayeeMailingAddress: v.optional(v.string()),
    status: bandPaymentStatusValue,
    confirmationToken: v.string(),
    confirmationEmailSentAt: v.optional(v.number()),
    confirmationEmailNotificationId: v.optional(v.id("emailNotifications")),
    confirmationResendEmailId: v.optional(v.string()),
    confirmedAt: v.optional(v.number()),
    confirmationReplyFrom: v.optional(v.string()),
    confirmationReplyBody: v.optional(v.string()),
    confirmationReplyEmailId: v.optional(v.string()),
    servicePaymentNumber: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    paidByUserId: v.optional(v.string()),
    bandNotifiedAt: v.optional(v.number()),
    photoAlbumUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_organizationId", ["organizationId"])
    .index("by_status", ["status"])
    .index("by_eventId_and_organizationId", ["eventId", "organizationId"])
    .index("by_confirmationToken", ["confirmationToken"]),

  bandPaymentSettings: defineTable({
    key: v.string(),
    photoAlbumUrl: v.optional(v.string()),
    financialManagerName: v.optional(v.string()),
    financialManagerPronouns: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  eventPaymentProofSubmissions: defineTable({
    eventId: v.id("events"),
    invoiceId: v.id("invoices"),
    paymentMethod: paymentProofMethodValue,
    paymentReference: v.string(),
    financeContactEmail: v.optional(v.string()),
    status: v.optional(paymentProofSubmissionStatusValue),
    invalidatedAt: v.optional(v.number()),
    invalidatedByUserId: v.optional(v.string()),
    invalidationNote: v.optional(v.string()),
    submittedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_invoiceId", ["invoiceId"])
    .index("by_eventId_and_status", ["eventId", "status"]),

  eventPullListItems: defineTable({
    eventId: v.id("events"),
    lineKind: v.optional(eventPullListLineKindValue),
    typeId: v.optional(v.id("inventoryTypes")),
    packageId: v.optional(v.id("inventoryPackages")),
    label: v.string(),
    quantityRequired: v.number(),
    quantityPulled: v.number(),
    quantityCheckedOut: v.number(),
    source: eventPullListSourceValue,
    sourcePackageId: v.optional(v.id("inventoryPackages")),
    sourceInvoiceLineKey: v.optional(v.string()),
    sortOrder: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_sortOrder", ["eventId", "sortOrder"])
    .index("by_packageId", ["packageId"]),

  eventSeriesPullListItems: defineTable({
    seriesId: v.id("eventSeries"),
    lineKind: eventPullListLineKindValue,
    typeId: v.optional(v.id("inventoryTypes")),
    packageId: v.optional(v.id("inventoryPackages")),
    label: v.string(),
    quantityRequired: v.number(),
    source: eventPullListSourceValue,
    sourcePackageId: v.optional(v.id("inventoryPackages")),
    sourceInvoiceLineKey: v.optional(v.string()),
    sortOrder: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_seriesId", ["seriesId"])
    .index("by_seriesId_and_sortOrder", ["seriesId", "sortOrder"]),

  eventMarketingDesigns: defineTable({
    eventId: v.id("events"),
    assigneeUserId: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    caption: v.optional(v.string()),
    additionalLinks: v.optional(v.array(marketingDesignLinkValue)),
    status: marketingDesignStatusValue,
    instagramPostId: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdByUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_assigneeUserId_and_status", ["assigneeUserId", "status"])
    .index("by_status", ["status"]),

  marketingPublishJobs: defineTable({
    designId: v.id("eventMarketingDesigns"),
    status: marketingPublishJobStatusValue,
    target: v.union(v.literal("instagram"), v.literal("website")),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_designId", ["designId"])
    .index("by_status", ["status"]),

  marketingPosts: defineTable({
    title: v.string(),
    slug: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    kind: marketingPostKindValue,
    heroImageUrl: v.optional(v.string()),
    featuredStats: v.optional(v.array(marketingFeaturedStatValue)),
    contentJson: v.string(),
    published: v.boolean(),
    featured: v.boolean(),
    publishedAt: v.optional(v.number()),
    updatedByUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_published_and_publishedAt", ["published", "publishedAt"])
    .index("by_published_and_featured", ["published", "featured"]),

  // Fixed-window counters backing the public-endpoint rate limiter. One row per
  // limiter key (e.g. `submitPublic:email@stanford.edu`). Pruned daily by cron.
  rateLimitHits: defineTable({
    key: v.string(),
    windowStartMs: v.number(),
    count: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_windowStartMs", ["windowStartMs"]),

  /** Singleton row: global marketing feature flags. Extend with new fields as
   *  more sections gain admin-toggled marketing boosts. */
  marketingSettings: defineTable({
    /** When true, the public Open Mic sign-up form shows the Arbor Live intro
     *  slide (promo video background + socials link) before the form steps. */
    openMicMarketingBoost: v.boolean(),
    updatedAt: v.number(),
  }),

  openMicSignups: defineTable({
    /** Event this sign-up belongs to. Open Mic is an add-on on events, so
     *  sign-ups are keyed to the event instead of a standalone night entity. */
    eventId: v.id("events"),
    name: v.string(),
    email: v.string(),
    whatTheyreDoing: v.string(),
    equipment: v.array(v.string()),
    /** Required when equipment includes "Background Music". */
    bgMusicLink: v.optional(v.string()),
    notes: v.optional(v.string()),
    /** "queued" = waiting in FCFS order, "current" = on stage now,
     *  "performed" = already went up, "removed" = crew dropped them. */
    status: v.union(
      v.literal("queued"),
      v.literal("current"),
      v.literal("performed"),
      v.literal("removed"),
    ),
    /** Strike counter for "Not here" presses. 0 → front of queue, 1 → back of
     *  queue, 2 → removed. Reset to 0 when a signup becomes current again. */
    skipsCount: v.number(),
    /** Monotonic order key (lower = earlier). New signups use Date.now();
     *  bumped-up signups get a value just below the current front to stay
     *  ahead of the rest of the queue. */
    position: v.number(),
    /** Epoch ms when status transitioned to "performed". For the leaderboard. */
    performedAt: v.optional(v.number()),
    submittedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId_and_position", ["eventId", "position"])
    .index("by_eventId_and_status", ["eventId", "status"])
    .index("by_status_and_performedAt", ["status", "performedAt"])
    .index("by_email", ["email"]),

  /** Public self-serve applications to join Arbor as a band/DJ. */
  bandApplications: defineTable({
    status: v.union(
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("declined"),
    ),
    contactName: v.string(),
    contactEmail: v.string(),
    contactPhone: v.optional(v.string()),
    bandDisplayName: v.string(),
    oneLiner: v.optional(v.string()),
    bio: v.optional(v.string()),
    publicWebsiteUrl: v.optional(v.string()),
    publicInstagramUrl: v.optional(v.string()),
    publicYoutubeUrl: v.optional(v.string()),
    demoURL: v.optional(v.string()),
    publicHeroImageUrl: v.optional(v.string()),
    genres: v.optional(v.array(v.string())),
    isSolo: v.boolean(),
    members: v.array(
      v.object({
        name: v.string(),
        email: v.optional(v.string()),
      }),
    ),
    submittedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedByUserId: v.optional(v.string()),
    declineReason: v.optional(v.string()),
    organizationId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_contactEmail", ["contactEmail"])
    .index("by_submittedAt", ["submittedAt"]),

  /** Public self-serve applications to join Arbor Live crew / staff. */
  crewApplications: defineTable({
    status: v.union(
      v.literal("submitted"),
      v.literal("closed"),
      v.literal("trainee"),
      v.literal("converted"),
    ),
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    heardAboutUs: v.string(),
    vertical: v.union(
      v.literal("Operations"),
      v.literal("Crew"),
      v.literal("Trivia"),
      v.literal("Marketing"),
    ),
    discipline: v.optional(
      v.union(
        v.literal("Sound"),
        v.literal("Lights"),
        v.literal("Design"),
        v.literal("unsure"),
      ),
    ),
    crewAvailabilityDays: v.optional(
      v.array(v.union(v.literal("friday"), v.literal("saturday"))),
    ),
    stanfordPosition: v.union(
      v.literal("undergrad"),
      v.literal("coterm"),
      v.literal("masters"),
      v.literal("phd"),
      v.literal("postdoc"),
      v.literal("other"),
    ),
    gradYear: v.optional(v.number()),
    submittedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedByUserId: v.optional(v.string()),
    convertedUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_email", ["email"])
    .index("by_submittedAt", ["submittedAt"]),
});

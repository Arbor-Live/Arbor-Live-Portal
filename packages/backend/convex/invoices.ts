import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireArborInternalContext, requireAuth, getUserId } from "./lib/auth";
import {
  normalizeEventStatus,
  syncEventStatusForLinkedInvoice,
  syncLinkedEventStatusFromInvoice,
} from "./lib/eventStatus";
import { recordEventStatusTransition, recordInvoiceStatusTransition } from "./lib/statusTransitions";
import { scheduleEventCancelledEmails } from "./email/triggers";
import { listEventsByInvoiceId } from "./lib/invoiceEvents";
import {
  billingQuantityForEquipmentLine,
  findSeriesByInvoiceId,
  isEquipmentSection,
  resolveBillableOccurrenceCount,
  resolveSeriesMetadataForInvoice,
  type EquipmentQuantityBasis,
} from "./lib/invoiceSeries";
import { buildInvoiceDocumentData } from "./lib/invoiceDocumentBuild";
import {
  approveInvoiceQuote,
  incrementPublicQuoteView,
  loadPublicQuoteView,
  requestInvoiceQuoteChanges,
  updateInvoicePaymentContacts,
} from "./lib/publicQuoteView";
import { listFulfillmentPackageBom } from "./lib/packageBom";
import { allocateInvoiceNumber } from "./lib/publicReferenceIds";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";
import { scheduleBookingQuoteReadyEmail } from "./email/bookingRequestEmails";
import {
  markPayingPartyNotified,
  schedulePayingPartyAddedEmail,
} from "./email/payingPartyEmails";
import {
  loadInvoiceCrewRateSettings,
  normalizeCompensationRateMode,
  resolveUserCompensationHourlyRateUsd,
} from "./lib/crewCompensation";
import {
  eventPassThroughCostUsd,
  invoicePassThroughUsd,
  netProfitFromInvoiceUsd,
} from "./lib/invoiceProfit";

const equipmentPricingModeValue = v.union(v.literal("subsidized"), v.literal("nonSubsidized"));
const crewRateModeValue = v.union(
  v.literal("normal"),
  v.literal("lead"),
  v.literal("custom"),
  v.literal("ot"),
);
const discountTypeValue = v.union(v.literal("amount"), v.literal("percent"));

const groupTypeValue = v.union(
  v.literal("vso"),
  v.literal("house"),
  v.literal("department"),
  v.literal("individual"),
);

const lineSectionValue = v.union(
  v.literal("equipment_package"),
  v.literal("equipment_type"),
  v.literal("external_rental"),
  v.literal("artist"),
  v.literal("crew"),
  v.literal("fee"),
);

const lineItemInput = v.object({
  section: lineSectionValue,
  order: v.number(),
  provider: v.optional(v.string()),
  label: v.string(),
  notes: v.optional(v.string()),
  quantity: v.number(),
  rateUsd: v.number(),
  packageId: v.optional(v.id("inventoryPackages")),
  typeId: v.optional(v.id("inventoryTypes")),
  feeDefinitionId: v.optional(v.id("invoiceFeeDefinitions")),
  equipmentQuantityBasis: v.optional(v.union(v.literal("total"), v.literal("per_occurrence"))),
  excludedTypeIds: v.optional(v.array(v.id("inventoryTypes"))),
  packageExclusionDiscountUsd: v.optional(v.number()),
  organizationId: v.optional(v.string()),
  memberCount: v.optional(v.number()),
  performanceHours: v.optional(v.number()),
});

type LineInput = {
  section: Doc<"invoiceLineItems">["section"];
  order: number;
  provider?: string;
  label: string;
  notes?: string;
  quantity: number;
  rateUsd: number;
  packageId?: Id<"inventoryPackages">;
  typeId?: Id<"inventoryTypes">;
  feeDefinitionId?: Id<"invoiceFeeDefinitions">;
  equipmentQuantityBasis?: EquipmentQuantityBasis;
  /** Package lines only: BOM types excluded from this instance (ala-carte discount). */
  excludedTypeIds?: Id<"inventoryTypes">[];
  /** Package lines only: staff override for the exclusion discount; falls back to a suggested amount. */
  packageExclusionDiscountUsd?: number;
  /** Artist lines: linked band/DJ org id. */
  organizationId?: string;
  /** Artist lines: number of people performing. */
  memberCount?: number;
  /** Artist lines: hours performing. */
  performanceHours?: number;
};

function trimOptional(raw: string | undefined) {
  const out = raw?.trim();
  return out ? out : undefined;
}

function resolveInvoiceTermsIds(invoice: Doc<"invoices">): Id<"invoiceTerms">[] {
  if (invoice.termsIds && invoice.termsIds.length > 0) return invoice.termsIds;
  if (invoice.termsId) return [invoice.termsId];
  return [];
}

function normalizeTermsIds(termsIds: Id<"invoiceTerms">[] | undefined) {
  if (!termsIds?.length) return undefined;
  const seen = new Set<Id<"invoiceTerms">>();
  const normalized: Id<"invoiceTerms">[] = [];
  for (const id of termsIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized.length ? normalized : undefined;
}

function makePublicApprovalToken() {
  const partA = crypto.randomUUID().replaceAll("-", "");
  const partB = crypto.randomUUID().replaceAll("-", "");
  return `quote_${partA}.${partB}`;
}

async function generateUniquePublicApprovalToken(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = makePublicApprovalToken();
    const existing = await ctx.db
      .query("invoices")
      .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", token))
      .unique();
    if (!existing) return token;
  }
  throw new Error("Unable to generate public quote token.");
}

// Public quote links grant approve / request-changes power, so they expire.
// Staff can mint a fresh 6-month window at any time via
// `regeneratePublicApprovalToken`.
function publicApprovalTokenExpiry(now: number): number {
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + 6);
  return expiresAt.getTime();
}

function typeRentalRate(
  type: Doc<"inventoryTypes">,
  equipmentPricingMode: "subsidized" | "nonSubsidized",
) {
  return equipmentPricingMode === "subsidized"
    ? (type.subsidizedRentalPriceUsd ?? type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0)
    : (type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0);
}

/** Sum of (excluded BOM type qty × current type rental rate) for a package's ala-carte discount suggestion. */
async function suggestPackageExclusionDiscount(
  ctx: MutationCtx,
  packageId: Id<"inventoryPackages">,
  excludedTypeIds: Id<"inventoryTypes">[],
  equipmentPricingMode: "subsidized" | "nonSubsidized",
) {
  if (!excludedTypeIds.length) return 0;
  const excludedSet = new Set(excludedTypeIds);
  const packageItems = await listFulfillmentPackageBom(ctx, packageId);
  let total = 0;
  for (const item of packageItems) {
    if (!excludedSet.has(item.typeId)) continue;
    const type = await ctx.db.get(item.typeId);
    if (!type) continue;
    total += item.quantity * typeRentalRate(type, equipmentPricingMode);
  }
  return Number(total.toFixed(2));
}

async function computeLineAmount(
  ctx: MutationCtx,
  line: LineInput,
  equipmentPricingMode: "subsidized" | "nonSubsidized",
  crewRateMode: "normal" | "lead" | "custom" | "ot",
  crewRates: { normal: number; lead: number; ot: number },
  billableOccurrenceCount: number,
) {
  if (line.section !== "external_rental" && line.quantity < 0) {
    throw new Error("Line quantity cannot be negative.");
  }
  let rate = line.rateUsd;
  let packageOriginalRateUsd: number | undefined;
  let packageExclusionDiscountUsd: number | undefined;

  if (line.section === "equipment_package" && line.packageId) {
    const pkg = await ctx.db.get(line.packageId);
    if (!pkg) throw new Error("Package line references a missing package.");
    const originalRate =
      equipmentPricingMode === "subsidized"
        ? (pkg.subsidizedPackagePriceUsd ?? pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100)
        : (pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100);
    packageOriginalRateUsd = originalRate;

    const excludedTypeIds = line.excludedTypeIds ?? [];
    const suggestedDiscount = await suggestPackageExclusionDiscount(
      ctx,
      line.packageId,
      excludedTypeIds,
      equipmentPricingMode,
    );
    packageExclusionDiscountUsd = Math.max(
      0,
      line.packageExclusionDiscountUsd ?? suggestedDiscount,
    );
    rate = Math.max(0, originalRate - packageExclusionDiscountUsd);
  }

  if (line.section === "equipment_type" && line.typeId) {
    const type = await ctx.db.get(line.typeId);
    if (!type) throw new Error("Type line references a missing type.");
    rate = typeRentalRate(type, equipmentPricingMode);
  }

  if (line.section === "crew") {
    // Prefer the stamped line rate (per-assignee Lead/Normal/Custom, or open-slot
    // default). Fall back to invoice crewRateMode for legacy lines with rate 0.
    if (line.rateUsd > 0) {
      rate = line.rateUsd;
    } else if (crewRateMode === "custom") {
      rate = line.rateUsd;
    } else if (crewRateMode === "lead" || crewRateMode === "ot") {
      rate = crewRates.lead;
    } else {
      rate = crewRates.normal;
    }
  }

  const billingQuantity = isEquipmentSection(line.section)
    ? billingQuantityForEquipmentLine(
        line.quantity,
        line.equipmentQuantityBasis,
        billableOccurrenceCount,
      )
    : line.section === "external_rental"
      ? line.quantity
      : Math.max(0, line.quantity);

  const effectiveRate = line.section === "external_rental" ? rate : Math.max(0, rate);
  const amount = Number((billingQuantity * effectiveRate).toFixed(2));
  return { rate, amount, packageOriginalRateUsd, packageExclusionDiscountUsd };
}

async function computeTotals(
  ctx: MutationCtx,
  lineItems: LineInput[],
  equipmentPricingMode: "subsidized" | "nonSubsidized",
  crewRateMode: "normal" | "lead" | "custom" | "ot",
  discountType: "amount" | "percent",
  discountValue: number,
  invoiceId?: Id<"invoices">,
) {
  const settings = await ctx.db.query("invoiceSettings").withIndex("by_key", (q) => q.eq("key", "default")).unique();
  const crewRates = {
    normal: settings?.crewNormalRateUsd ?? 0,
    lead: settings?.crewLeadRateUsd ?? settings?.crewOtRateUsd ?? settings?.crewNormalRateUsd ?? 0,
    ot: settings?.crewOtRateUsd ?? settings?.crewNormalRateUsd ?? 0,
  };

  const billableOccurrenceCount = invoiceId
    ? await resolveBillableOccurrenceCount(ctx, invoiceId)
    : 0;

  let equipmentSubtotalUsd = 0;
  let externalRentalsSubtotalUsd = 0;
  let artistsSubtotalUsd = 0;
  let crewSubtotalUsd = 0;
  let feesSubtotalUsd = 0;

  const normalized: Array<
    LineInput & {
      rateUsd: number;
      amountUsd: number;
      packageOriginalRateUsd?: number;
      packageExclusionDiscountUsd?: number;
    }
  > = [];
  for (const line of lineItems) {
    const { rate, amount, packageOriginalRateUsd, packageExclusionDiscountUsd } =
      await computeLineAmount(
        ctx,
        line,
        equipmentPricingMode,
        crewRateMode,
        crewRates,
        billableOccurrenceCount,
      );
    normalized.push({
      ...line,
      rateUsd: rate,
      amountUsd: amount,
      packageOriginalRateUsd,
      packageExclusionDiscountUsd,
    });
    if (line.section === "equipment_package" || line.section === "equipment_type") equipmentSubtotalUsd += amount;
    else if (line.section === "external_rental") externalRentalsSubtotalUsd += amount;
    else if (line.section === "artist") artistsSubtotalUsd += amount;
    else if (line.section === "crew") crewSubtotalUsd += amount;
    else if (line.section === "fee") feesSubtotalUsd += amount;
  }

  const subtotalUsd = Number(
    (equipmentSubtotalUsd + externalRentalsSubtotalUsd + artistsSubtotalUsd + crewSubtotalUsd + feesSubtotalUsd).toFixed(2),
  );

  const discountAmountUsd =
    discountType === "percent"
      ? Number((subtotalUsd * Math.max(0, discountValue) / 100).toFixed(2))
      : Number(Math.max(0, discountValue).toFixed(2));
  const totalUsd = Number(Math.max(0, subtotalUsd - discountAmountUsd).toFixed(2));
  const discountWarning =
    discountAmountUsd > equipmentSubtotalUsd
      ? "Discount exceeds equipment rental subtotal."
      : undefined;

  return {
    normalized,
    equipmentSubtotalUsd: Number(equipmentSubtotalUsd.toFixed(2)),
    externalRentalsSubtotalUsd: Number(externalRentalsSubtotalUsd.toFixed(2)),
    artistsSubtotalUsd: Number(artistsSubtotalUsd.toFixed(2)),
    crewSubtotalUsd: Number(crewSubtotalUsd.toFixed(2)),
    feesSubtotalUsd: Number(feesSubtotalUsd.toFixed(2)),
    subtotalUsd,
    discountAmountUsd,
    totalUsd,
    discountWarning,
  };
}

function lineDocToInput(line: Doc<"invoiceLineItems">): LineInput {
  return {
    section: line.section,
    order: line.order,
    provider: line.provider,
    label: line.label,
    notes: line.notes,
    quantity: line.quantity,
    rateUsd: line.rateUsd,
    packageId: line.packageId,
    typeId: line.typeId,
    feeDefinitionId: line.feeDefinitionId,
    equipmentQuantityBasis: line.equipmentQuantityBasis,
    excludedTypeIds: line.excludedTypeIds,
    packageExclusionDiscountUsd: line.packageExclusionDiscountUsd,
    organizationId: line.organizationId,
    memberCount: line.memberCount,
    performanceHours: line.performanceHours,
  };
}

async function resolveBillableCountAtSave(ctx: MutationCtx, invoiceId: Id<"invoices">) {
  const series = await findSeriesByInvoiceId(ctx, invoiceId);
  if (!series) return undefined;
  const count = await resolveBillableOccurrenceCount(ctx, invoiceId);
  return count > 0 ? count : undefined;
}

async function replaceLineItems(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  rows: Array<
    LineInput & {
      rateUsd: number;
      amountUsd: number;
      packageOriginalRateUsd?: number;
      packageExclusionDiscountUsd?: number;
    }
  >,
) {
  const existing = await ctx.db
    .query("invoiceLineItems")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(500);
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  const now = Date.now();
  for (const row of rows.sort((a, b) => a.order - b.order)) {
    await ctx.db.insert("invoiceLineItems", {
      invoiceId,
      section: row.section,
      order: row.order,
      provider: trimOptional(row.provider),
      label: row.label.trim(),
      notes: trimOptional(row.notes),
      quantity: row.quantity,
      rateUsd: row.rateUsd,
      amountUsd: row.amountUsd,
      packageId: row.packageId,
      typeId: row.typeId,
      excludedTypeIds: row.excludedTypeIds?.length ? row.excludedTypeIds : undefined,
      packageOriginalRateUsd: row.packageOriginalRateUsd,
      packageExclusionDiscountUsd: row.packageExclusionDiscountUsd,
      feeDefinitionId: row.feeDefinitionId,
      equipmentQuantityBasis: row.equipmentQuantityBasis,
      organizationId: trimOptional(row.organizationId),
      memberCount:
        row.section === "artist" && row.memberCount !== undefined && row.memberCount > 0
          ? row.memberCount
          : undefined,
      performanceHours:
        row.section === "artist" &&
        row.performanceHours !== undefined &&
        row.performanceHours > 0
          ? row.performanceHours
          : undefined,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export const listManagers = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: { cursor: null, numItems: 200 },
    });
    const users = (result?.page ?? []) as Array<{
      _id?: string;
      id?: string;
      name?: string;
      email?: string;
      role?: string | null;
      image?: string | null;
    }>;
    // Arbor staff quoting events need per-person Normal/Lead/Custom rates so
    // assigned leads bill at lead rate on the invoice (not only global Normal).
    const settings = await loadInvoiceCrewRateSettings(ctx);
    const rateRows = await ctx.db.query("userCompensationRates").withIndex("by_updatedAt").take(1000);
    const rateByUserId = new Map(
      rateRows.map((rate) => [
        rate.userId,
        {
          rateMode: normalizeCompensationRateMode(rate.rateMode),
          hourlyRateUsd: resolveUserCompensationHourlyRateUsd(rate, settings),
        },
      ]),
    );
    const profiles = await ctx.db.query("userAdminProfiles").withIndex("by_active").take(2000);
    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
    return users
      .map((user) => {
        const userId = user.id ?? user._id ?? "";
        const profile = profileByUserId.get(userId);
        const compensation = rateByUserId.get(userId);
        return {
          id: userId,
          name: user.name ?? user.email ?? "Unknown user",
          email: user.email,
          role: user.role ?? undefined,
          image: user.image ?? undefined,
          hourlyRateUsd: compensation?.hourlyRateUsd,
          rateMode: compensation?.rateMode,
          pronouns: profile?.pronouns ?? undefined,
          gradYear: profile?.gradYear ?? undefined,
        };
      })
      .filter((u) => Boolean(u.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

const INVOICE_LIST_LIMIT = 200;

const invoiceListStatusValue = v.union(
  v.literal("draft"),
  v.literal("finalized"),
  v.literal("void"),
);

/**
 * Newest `INVOICE_LIST_LIMIT` invoices. Both branches read a createdAt-ordered
 * index descending so the take is a recency cap, not an arbitrary slice — a
 * `.take()` that needs a JS re-sort afterwards already picked the wrong rows.
 */
async function recentInvoices(
  ctx: QueryCtx,
  status: "draft" | "finalized" | "void" | undefined,
) {
  if (status) {
    return await ctx.db
      .query("invoices")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", status))
      .order("desc")
      .take(INVOICE_LIST_LIMIT);
  }
  // Default view hides voided invoices; the explicit Void filter surfaces them.
  const [draftRows, finalizedRows] = await Promise.all([
    ctx.db
      .query("invoices")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "draft"))
      .order("desc")
      .take(INVOICE_LIST_LIMIT),
    ctx.db
      .query("invoices")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "finalized"))
      .order("desc")
      .take(INVOICE_LIST_LIMIT),
  ]);
  return [...draftRows, ...finalizedRows]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, INVOICE_LIST_LIMIT);
}

/**
 * Series / linked-event labels for the invoice list. Deliberately lighter than
 * `resolveSeriesMetadataForInvoice`, which scans up to 200 series occurrences
 * per invoice to compute counts the list never renders.
 */
async function resolveInvoiceListLabels(ctx: QueryCtx, invoiceId: Id<"invoices">) {
  const series = await findSeriesByInvoiceId(ctx, invoiceId);
  const linkedEvents = await listEventsByInvoiceId(ctx, invoiceId);
  const primaryEvent = linkedEvents[0];
  const eventCostsUsd = primaryEvent
    ? (primaryEvent.crewCostUsd ?? 0) +
      (primaryEvent.bandsCostUsd ?? 0) +
      (primaryEvent.externalRentalsCostUsd ?? 0) +
      (primaryEvent.otherCostUsd ?? 0)
    : null;
  const eventPassThroughCostsUsd = primaryEvent
    ? eventPassThroughCostUsd(
        primaryEvent.bandsCostUsd ?? 0,
        primaryEvent.externalRentalsCostUsd ?? 0,
      )
    : null;
  if (series) {
    return {
      seriesTitle: series.title,
      linkedEventTitle: linkedEvents[0]?.title,
      eventCostsUsd,
      eventPassThroughCostsUsd,
    };
  }
  const seriesIds = [
    ...new Set(
      linkedEvents.map((row) => row.seriesId).filter((id): id is Id<"eventSeries"> => Boolean(id)),
    ),
  ];
  const seriesDoc = seriesIds.length === 1 ? await ctx.db.get(seriesIds[0]!) : null;
  return {
    seriesTitle: seriesDoc?.title,
    linkedEventTitle: linkedEvents[0]?.title,
    eventCostsUsd,
    eventPassThroughCostsUsd,
  };
}

export const list = query({
  args: { status: v.optional(invoiceListStatusValue) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await recentInvoices(ctx, args.status);
  },
});

/**
 * Invoice list rows. Returns an explicit slim projection rather than spreading
 * the whole doc — the list table renders seven columns, not sixty fields.
 */
export const listEnriched = query({
  args: { status: v.optional(invoiceListStatusValue) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const rows = await recentInvoices(ctx, args.status);
    return await Promise.all(
      rows.map(async (invoice) => {
        const { seriesTitle, linkedEventTitle, eventCostsUsd, eventPassThroughCostsUsd } =
          await resolveInvoiceListLabels(ctx, invoice._id);
        return {
          _id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          clientApprovalStatus: invoice.clientApprovalStatus,
          managerName: invoice.managerName,
          issueDate: invoice.issueDate,
          totalUsd: invoice.totalUsd,
          netProfitUsd:
            eventCostsUsd == null || eventPassThroughCostsUsd == null
              ? null
              : netProfitFromInvoiceUsd(
                  invoice.totalUsd,
                  invoicePassThroughUsd(
                    invoice.artistsSubtotalUsd,
                    invoice.externalRentalsSubtotalUsd,
                  ),
                  eventCostsUsd,
                  eventPassThroughCostsUsd,
                ),
          publicApprovalToken: invoice.publicApprovalToken,
          clientGroupName: invoice.clientGroupName,
          clientContactName: invoice.clientContactName,
          createdAt: invoice.createdAt,
          seriesTitle,
          linkedEventTitle,
        };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) return null;
    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", args.id))
      .take(500);
    const series = await resolveSeriesMetadataForInvoice(ctx, args.id);
    return { invoice, lineItems, series };
  },
});

export const getDocumentData = query({
  args: {
    id: v.id("invoices"),
    siteOrigin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) return null;
    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", args.id))
      .take(500);
    const digitalQuoteUrl =
      invoice.publicApprovalToken && args.siteOrigin
        ? `${args.siteOrigin}/event/${invoice.publicApprovalToken}`
        : undefined;
    return await buildInvoiceDocumentData(ctx, invoice, lineItems, digitalQuoteUrl);
  },
});

export const getPublicQuoteByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", args.token))
      .unique();
    if (!invoice) return null;
    if (invoice.sourceEventRequestId) return null;
    if (invoice.publicApprovalTokenExpiresAt && invoice.publicApprovalTokenExpiresAt < Date.now()) return null;
    if (invoice.status === "void") return null;

    return await loadPublicQuoteView(ctx, invoice);
  },
});

export const recordPublicQuoteView = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `quoteView:${args.token}`, { limit: 120, windowMs: HOUR_MS });
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", args.token))
      .unique();
    if (!invoice || invoice.status === "void") return null;
    if (invoice.publicApprovalTokenExpiresAt && invoice.publicApprovalTokenExpiresAt < Date.now()) {
      return null;
    }
    await incrementPublicQuoteView(ctx, invoice);
    return null;
  },
});

export const createDraft = mutation({
  args: {
    issueDate: v.string(),
    dueDate: v.optional(v.string()),
    managerUserId: v.string(),
    managerName: v.string(),
    managerEmail: v.optional(v.string()),
    groupId: v.optional(v.id("invoiceGroups")),
    contactId: v.optional(v.id("invoiceContacts")),
    clientGroupName: v.optional(v.string()),
    clientGroupType: v.optional(groupTypeValue),
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
    notes: v.optional(v.string()),
    termsIds: v.optional(v.array(v.id("invoiceTerms"))),
    additionalTermsMarkdown: v.optional(v.string()),
    lineItems: v.array(lineItemInput),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const publicApprovalToken = await generateUniquePublicApprovalToken(ctx);
    const normalizedTermsIds = normalizeTermsIds(args.termsIds);
    const totals = await computeTotals(
      ctx,
      args.lineItems as LineInput[],
      args.equipmentPricingMode,
      args.crewRateMode,
      args.discountType,
      args.discountValue,
    );
    const now = Date.now();
    const id = await ctx.db.insert("invoices", {
      invoiceNumber: await allocateInvoiceNumber(ctx),
      status: "draft",
      issueDate: args.issueDate,
      dueDate: trimOptional(args.dueDate),
      managerUserId: args.managerUserId,
      managerName: args.managerName.trim(),
      managerEmail: trimOptional(args.managerEmail),
      groupId: args.groupId,
      contactId: args.contactId,
      clientGroupName: trimOptional(args.clientGroupName),
      clientGroupType: args.clientGroupType,
      clientContactName: trimOptional(args.clientContactName),
      clientEmail: trimOptional(args.clientEmail),
      clientPhone: trimOptional(args.clientPhone),
      clientAddressLine1: trimOptional(args.clientAddressLine1),
      clientAddressLine2: trimOptional(args.clientAddressLine2),
      clientCity: trimOptional(args.clientCity),
      clientState: trimOptional(args.clientState),
      clientPostalCode: trimOptional(args.clientPostalCode),
      equipmentPricingMode: args.equipmentPricingMode,
      crewRateMode: args.crewRateMode,
      discountType: args.discountType,
      discountValue: Math.max(0, args.discountValue),
      discountAmountUsd: totals.discountAmountUsd,
      discountWarning: totals.discountWarning,
      equipmentSubtotalUsd: totals.equipmentSubtotalUsd,
      externalRentalsSubtotalUsd: totals.externalRentalsSubtotalUsd,
      artistsSubtotalUsd: totals.artistsSubtotalUsd,
      crewSubtotalUsd: totals.crewSubtotalUsd,
      feesSubtotalUsd: totals.feesSubtotalUsd,
      subtotalUsd: totals.subtotalUsd,
      totalUsd: totals.totalUsd,
      notes: trimOptional(args.notes),
      termsIds: normalizedTermsIds,
      termsId: undefined,
      additionalTermsMarkdown: trimOptional(args.additionalTermsMarkdown),
      clientApprovalStatus: "pending",
      publicApprovalToken,
      publicApprovalTokenExpiresAt: publicApprovalTokenExpiry(now),
      approvedAt: undefined,
      changesRequestedAt: undefined,
      clientApprovalNote: undefined,
      termsVersionAccepted: undefined,
      termsAcceptedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
    await replaceLineItems(ctx, id, totals.normalized);
    if (args.groupId) await ctx.db.patch(args.groupId, { lastUsedAt: now, updatedAt: now });
    if (args.contactId) await ctx.db.patch(args.contactId, { lastUsedAt: now, updatedAt: now });
    return { id, warning: totals.discountWarning, publicApprovalToken };
  },
});

export const updateDraft = mutation({
  args: {
    id: v.id("invoices"),
    issueDate: v.string(),
    dueDate: v.optional(v.string()),
    managerUserId: v.string(),
    managerName: v.string(),
    managerEmail: v.optional(v.string()),
    groupId: v.optional(v.id("invoiceGroups")),
    contactId: v.optional(v.id("invoiceContacts")),
    clientGroupName: v.optional(v.string()),
    clientGroupType: v.optional(groupTypeValue),
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
    notes: v.optional(v.string()),
    termsIds: v.optional(v.array(v.id("invoiceTerms"))),
    additionalTermsMarkdown: v.optional(v.string()),
    lineItems: v.array(lineItemInput),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Invoice not found.");
    const publicApprovalToken = existing.sourceEventRequestId
      ? undefined
      : existing.publicApprovalToken || (await generateUniquePublicApprovalToken(ctx));
    // Only start a fresh expiry window when we mint a brand-new token; editing an
    // invoice that already has a live link must not silently extend it.
    const mintedNewToken = Boolean(publicApprovalToken) && !existing.publicApprovalToken;
    const normalizedTermsIds = normalizeTermsIds(args.termsIds);
    const totals = await computeTotals(
      ctx,
      args.lineItems as LineInput[],
      args.equipmentPricingMode,
      args.crewRateMode,
      args.discountType,
      args.discountValue,
      args.id,
    );
    const now = Date.now();
    await ctx.db.patch(args.id, {
      issueDate: args.issueDate,
      dueDate: trimOptional(args.dueDate),
      managerUserId: args.managerUserId,
      managerName: args.managerName.trim(),
      managerEmail: trimOptional(args.managerEmail),
      groupId: args.groupId,
      contactId: args.contactId,
      clientGroupName: trimOptional(args.clientGroupName),
      clientGroupType: args.clientGroupType,
      clientContactName: trimOptional(args.clientContactName),
      clientEmail: trimOptional(args.clientEmail),
      clientPhone: trimOptional(args.clientPhone),
      clientAddressLine1: trimOptional(args.clientAddressLine1),
      clientAddressLine2: trimOptional(args.clientAddressLine2),
      clientCity: trimOptional(args.clientCity),
      clientState: trimOptional(args.clientState),
      clientPostalCode: trimOptional(args.clientPostalCode),
      equipmentPricingMode: args.equipmentPricingMode,
      crewRateMode: args.crewRateMode,
      discountType: args.discountType,
      discountValue: Math.max(0, args.discountValue),
      discountAmountUsd: totals.discountAmountUsd,
      discountWarning: totals.discountWarning,
      equipmentSubtotalUsd: totals.equipmentSubtotalUsd,
      externalRentalsSubtotalUsd: totals.externalRentalsSubtotalUsd,
      artistsSubtotalUsd: totals.artistsSubtotalUsd,
      crewSubtotalUsd: totals.crewSubtotalUsd,
      feesSubtotalUsd: totals.feesSubtotalUsd,
      subtotalUsd: totals.subtotalUsd,
      totalUsd: totals.totalUsd,
      notes: trimOptional(args.notes),
      termsIds: normalizedTermsIds,
      termsId: undefined,
      additionalTermsMarkdown: trimOptional(args.additionalTermsMarkdown),
      publicApprovalToken,
      ...(mintedNewToken ? { publicApprovalTokenExpiresAt: publicApprovalTokenExpiry(now) } : {}),
      billableOccurrenceCountAtSave: await resolveBillableCountAtSave(ctx, args.id),
      updatedAt: now,
    });
    await replaceLineItems(ctx, args.id, totals.normalized);
    if (args.groupId) await ctx.db.patch(args.groupId, { lastUsedAt: now, updatedAt: now });
    if (args.contactId) await ctx.db.patch(args.contactId, { lastUsedAt: now, updatedAt: now });
    return { id: args.id, warning: totals.discountWarning };
  },
});

export const regeneratePublicApprovalToken = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Invoice not found.");
    if (existing.sourceEventRequestId) {
      throw new Error("Booking-request quotes are reviewed on the request portal, not via a standalone link.");
    }
    const now = Date.now();
    const token = await generateUniquePublicApprovalToken(ctx);
    await ctx.db.patch(args.id, {
      publicApprovalToken: token,
      publicApprovalTokenExpiresAt: publicApprovalTokenExpiry(now),
      updatedAt: now,
    });
    return { token };
  },
});

export const approveByToken = mutation({
  args: {
    token: v.string(),
    signedName: v.string(),
    clientIsPaymentSubmitter: v.boolean(),
    paymentSubmitterName: v.optional(v.string()),
    paymentSubmitterEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `quoteToken:${args.token}`, { limit: 30, windowMs: HOUR_MS });
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", args.token))
      .unique();
    if (!invoice) throw new Error("Quote not found.");
    if (invoice.sourceEventRequestId) {
      throw new Error("Please review this quote from your booking request link.");
    }
    if (invoice.publicApprovalTokenExpiresAt && invoice.publicApprovalTokenExpiresAt < Date.now()) {
      throw new Error("Quote not found.");
    }
    await approveInvoiceQuote(ctx, invoice, args);
    return { ok: true };
  },
});

export const requestChangesByToken = mutation({
  args: { token: v.string(), note: v.string() },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `quoteToken:${args.token}`, { limit: 30, windowMs: HOUR_MS });
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", args.token))
      .unique();
    if (!invoice) throw new Error("Quote not found.");
    if (invoice.sourceEventRequestId) {
      throw new Error("Please review this quote from your booking request link.");
    }
    if (invoice.publicApprovalTokenExpiresAt && invoice.publicApprovalTokenExpiresAt < Date.now()) {
      throw new Error("Quote not found.");
    }
    await requestInvoiceQuoteChanges(ctx, invoice, args.note);
    return { ok: true };
  },
});

export const updatePaymentContactsByToken = mutation({
  args: {
    token: v.string(),
    clientIsPaymentSubmitter: v.optional(v.boolean()),
    paymentSubmitterName: v.optional(v.string()),
    paymentSubmitterEmail: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `quoteToken:${args.token}`, { limit: 30, windowMs: HOUR_MS });
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", args.token))
      .unique();
    if (!invoice) throw new Error("Quote not found.");
    if (invoice.sourceEventRequestId) {
      throw new Error("Please review this quote from your booking request link.");
    }
    if (invoice.publicApprovalTokenExpiresAt && invoice.publicApprovalTokenExpiresAt < Date.now()) {
      throw new Error("Quote not found.");
    }
    const { token: _token, ...contactArgs } = args;
    await updateInvoicePaymentContacts(ctx, invoice, contactArgs);
    return { ok: true as const };
  },
});

export const updatePaymentSubmitter = mutation({
  args: {
    id: v.id("invoices"),
    clientIsPaymentSubmitter: v.boolean(),
    paymentSubmitterName: v.optional(v.string()),
    paymentSubmitterEmail: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found.");
    await updateInvoicePaymentContacts(ctx, invoice, {
      clientIsPaymentSubmitter: args.clientIsPaymentSubmitter,
      paymentSubmitterName: args.paymentSubmitterName,
      paymentSubmitterEmail: args.paymentSubmitterEmail,
    });
    return { ok: true as const };
  },
});

export const resendPayingPartyNotification = mutation({
  args: { id: v.id("invoices") },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found.");
    if ((invoice.clientApprovalStatus ?? "pending") !== "approved") {
      throw new Error("Quote must be approved before notifying the paying party.");
    }
    if (invoice.clientIsPaymentSubmitter) {
      throw new Error("The client is listed as the payment submitter.");
    }
    const email = invoice.paymentSubmitterEmail?.trim().toLowerCase();
    if (!email) throw new Error("No paying party email is set.");

    await schedulePayingPartyAddedEmail(ctx, {
      invoice,
      payingPartyEmail: email,
      payingPartyName: invoice.paymentSubmitterName,
      approvedByName: invoice.clientApprovalSignedName ?? invoice.clientContactName ?? "The client",
      idempotencySuffix: `resend:${Date.now()}`,
    });
    await markPayingPartyNotified(ctx, invoice._id, email);
    return { ok: true as const };
  },
});

export const resetApprovalToPending = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found.");
    await ctx.db.patch(args.id, {
      clientApprovalStatus: "pending",
      approvedAt: undefined,
      changesRequestedAt: undefined,
      clientApprovalNote: undefined,
      clientApprovalSignedName: undefined,
      paymentFinanceContactEmail: undefined,
      clientIsPaymentSubmitter: undefined,
      paymentSubmitterName: undefined,
      paymentSubmitterEmail: undefined,
      payingPartyNotifiedEmail: undefined,
      payingPartyNotifiedAt: undefined,
      termsVersionAccepted: undefined,
      termsAcceptedAt: undefined,
      updatedAt: Date.now(),
    });
    await syncLinkedEventStatusFromInvoice(ctx, args.id, "pending");
    return { ok: true };
  },
});

export const recalculateTotals = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found.");
    const lineItems = await ctx.db.query("invoiceLineItems").withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.id)).take(500);
    const totals = await computeTotals(
      ctx,
      lineItems.map(lineDocToInput),
      invoice.equipmentPricingMode,
      invoice.crewRateMode,
      invoice.discountType,
      invoice.discountValue,
      args.id,
    );
    await ctx.db.patch(args.id, {
      discountAmountUsd: totals.discountAmountUsd,
      discountWarning: totals.discountWarning,
      equipmentSubtotalUsd: totals.equipmentSubtotalUsd,
      externalRentalsSubtotalUsd: totals.externalRentalsSubtotalUsd,
      artistsSubtotalUsd: totals.artistsSubtotalUsd,
      crewSubtotalUsd: totals.crewSubtotalUsd,
      feesSubtotalUsd: totals.feesSubtotalUsd,
      subtotalUsd: totals.subtotalUsd,
      totalUsd: totals.totalUsd,
      updatedAt: Date.now(),
    });
    return { warning: totals.discountWarning };
  },
});

export const finalize = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found.");
    await ctx.db.patch(args.id, { status: "finalized", updatedAt: Date.now() });
  },
});

/**
 * Void an invoice: hidden from the default list (still visible under the
 * explicit Void filter) and every linked event that isn't already cancelled is
 * cancelled with the usual cancellation emails. Blocked when payment proofs are
 * on record — voiding a paid invoice would hide money that changed hands.
 */
export const voidInvoice = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status === "void") return;

    const proofSubmissions = await ctx.db
      .query("eventPaymentProofSubmissions")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.id))
      .take(100);
    if (proofSubmissions.some((row) => (row.status ?? "active") === "active")) {
      throw new Error(
        "This invoice has recorded payments. Invalidate the payment proof before voiding.",
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.id, { status: "void", updatedAt: now });
    await recordInvoiceStatusTransition(ctx, args.id, invoice.status, "void", {
      actorUserId: getUserId(user),
      at: now,
      reasonCode: "other",
      reasonNote: "Invoice voided",
    });

    const linkedEvents = await listEventsByInvoiceId(ctx, args.id);
    for (const event of linkedEvents) {
      const prevStatus = normalizeEventStatus(event.status);
      if (prevStatus === "cancelled") continue;
      await ctx.db.patch(event._id, {
        status: "cancelled",
        updatedAt: now,
        cancelReasonCode: "other",
        cancelReasonNote: `Invoice ${invoice.invoiceNumber} voided`,
      });
      await recordEventStatusTransition(ctx, event._id, prevStatus, "cancelled", {
        actorUserId: getUserId(user),
        at: now,
        reasonCode: "other",
        reasonNote: `Invoice ${invoice.invoiceNumber} voided`,
      });
      await scheduleEventCancelledEmails(ctx, event._id, now);
    }
  },
});

export const recalculateSeriesEquipmentLines = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await findSeriesByInvoiceId(ctx, args.id);
    if (!series) {
      throw new Error("No event series is linked to this invoice.");
    }
    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found.");
    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.id))
      .take(500);
    const totals = await computeTotals(
      ctx,
      lineItems.map(lineDocToInput),
      invoice.equipmentPricingMode,
      invoice.crewRateMode,
      invoice.discountType,
      invoice.discountValue,
      args.id,
    );
    await ctx.db.patch(args.id, {
      discountAmountUsd: totals.discountAmountUsd,
      discountWarning: totals.discountWarning,
      equipmentSubtotalUsd: totals.equipmentSubtotalUsd,
      externalRentalsSubtotalUsd: totals.externalRentalsSubtotalUsd,
      artistsSubtotalUsd: totals.artistsSubtotalUsd,
      crewSubtotalUsd: totals.crewSubtotalUsd,
      feesSubtotalUsd: totals.feesSubtotalUsd,
      subtotalUsd: totals.subtotalUsd,
      totalUsd: totals.totalUsd,
      updatedAt: Date.now(),
      billableOccurrenceCountAtSave: await resolveBillableCountAtSave(ctx, args.id),
    });
    await replaceLineItems(ctx, args.id, totals.normalized);
    return { warning: totals.discountWarning };
  },
});

/**
 * Reverse of eventPullLists.scaffoldFromInvoice: rewrites this invoice's
 * equipment lines to match the linked event's current non-manual pull-list
 * rows (manual/extra rows are staff additions and are left off the invoice).
 * Non-equipment lines (crew, artists, external rentals, fees) are untouched.
 */
export const resyncEquipmentFromPullList = mutation({
  args: { id: v.id("invoices"), eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found.");
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    if (event.invoiceId !== args.id) throw new Error("Event is not linked to this invoice.");

    const series = event.seriesId ? await ctx.db.get(event.seriesId) : null;
    const useSeriesQty = Boolean(series?.invoiceId && series.invoiceId === args.id);
    const billableOccurrenceCount = useSeriesQty
      ? Math.max(1, await resolveBillableOccurrenceCount(ctx, args.id))
      : 1;

    const pullItems = await ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const nonManualItems = pullItems.filter((item) => (item.source ?? "manual") !== "manual");

    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.id))
      .take(500);
    const existingPackageLines = new Map(
      lineItems
        .filter((line) => line.section === "equipment_package" && line.packageId)
        .map((line) => [line.packageId as Id<"inventoryPackages">, line]),
    );
    const existingTypeLines = new Map(
      lineItems
        .filter((line) => line.section === "equipment_type" && line.typeId)
        .map((line) => [line.typeId as Id<"inventoryTypes">, line]),
    );

    function sameExclusions(a: Id<"inventoryTypes">[] | undefined, b: Id<"inventoryTypes">[] | undefined) {
      const setA = [...(a ?? [])].sort();
      const setB = [...(b ?? [])].sort();
      return setA.length === setB.length && setA.every((value, idx) => value === setB[idx]);
    }

    const equipmentLines: LineInput[] = [];
    let order = 0;
    for (const item of nonManualItems) {
      const lineKind: "type" | "package" = item.lineKind ?? (item.packageId ? "package" : "type");
      if (lineKind === "package" && item.packageId) {
        const existing = existingPackageLines.get(item.packageId);
        const basis: EquipmentQuantityBasis = existing?.equipmentQuantityBasis ?? "total";
        const quantity =
          basis === "per_occurrence" ? item.quantityRequired : item.quantityRequired * billableOccurrenceCount;
        const excludedTypeIds = item.excludedTypeIds?.length ? item.excludedTypeIds : undefined;
        equipmentLines.push({
          section: "equipment_package",
          order: order++,
          label: item.label,
          quantity,
          rateUsd: 0,
          packageId: item.packageId,
          equipmentQuantityBasis: basis,
          excludedTypeIds,
          packageExclusionDiscountUsd: sameExclusions(existing?.excludedTypeIds, excludedTypeIds)
            ? existing?.packageExclusionDiscountUsd
            : undefined,
        });
      } else if (item.typeId) {
        const existing = existingTypeLines.get(item.typeId);
        const basis: EquipmentQuantityBasis = existing?.equipmentQuantityBasis ?? "total";
        const quantity =
          basis === "per_occurrence" ? item.quantityRequired : item.quantityRequired * billableOccurrenceCount;
        equipmentLines.push({
          section: "equipment_type",
          order: order++,
          label: item.label,
          quantity,
          rateUsd: 0,
          typeId: item.typeId,
          equipmentQuantityBasis: basis,
        });
      }
    }

    const otherLines: LineInput[] = lineItems
      .filter((line) => line.section !== "equipment_package" && line.section !== "equipment_type")
      .map((line) => ({
        ...lineDocToInput(line),
        order: order++,
      }));

    const totals = await computeTotals(
      ctx,
      [...equipmentLines, ...otherLines],
      invoice.equipmentPricingMode,
      invoice.crewRateMode,
      invoice.discountType,
      invoice.discountValue,
      args.id,
    );
    await ctx.db.patch(args.id, {
      discountAmountUsd: totals.discountAmountUsd,
      discountWarning: totals.discountWarning,
      equipmentSubtotalUsd: totals.equipmentSubtotalUsd,
      externalRentalsSubtotalUsd: totals.externalRentalsSubtotalUsd,
      artistsSubtotalUsd: totals.artistsSubtotalUsd,
      crewSubtotalUsd: totals.crewSubtotalUsd,
      feesSubtotalUsd: totals.feesSubtotalUsd,
      subtotalUsd: totals.subtotalUsd,
      totalUsd: totals.totalUsd,
      updatedAt: Date.now(),
      billableOccurrenceCountAtSave: await resolveBillableCountAtSave(ctx, args.id),
    });
    await replaceLineItems(ctx, args.id, totals.normalized);
    return { updatedLineCount: equipmentLines.length };
  },
});

export const duplicate = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Invoice not found.");
    const lineItems = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", args.id))
      .take(500);
    const publicApprovalToken = existing.sourceEventRequestId
      ? undefined
      : await generateUniquePublicApprovalToken(ctx);
    const now = Date.now();
    const newId = await ctx.db.insert("invoices", {
      invoiceNumber: await allocateInvoiceNumber(ctx),
      status: "draft",
      issueDate: existing.issueDate,
      dueDate: existing.dueDate,
      managerUserId: existing.managerUserId,
      managerName: existing.managerName,
      managerEmail: existing.managerEmail,
      groupId: existing.groupId,
      contactId: existing.contactId,
      clientGroupName: existing.clientGroupName,
      clientGroupType: existing.clientGroupType,
      clientContactName: existing.clientContactName,
      clientEmail: existing.clientEmail,
      clientPhone: existing.clientPhone,
      clientAddressLine1: existing.clientAddressLine1,
      clientAddressLine2: existing.clientAddressLine2,
      clientCity: existing.clientCity,
      clientState: existing.clientState,
      clientPostalCode: existing.clientPostalCode,
      equipmentPricingMode: existing.equipmentPricingMode,
      crewRateMode: existing.crewRateMode,
      discountType: existing.discountType,
      discountValue: existing.discountValue,
      discountAmountUsd: existing.discountAmountUsd,
      discountWarning: existing.discountWarning,
      equipmentSubtotalUsd: existing.equipmentSubtotalUsd,
      externalRentalsSubtotalUsd: existing.externalRentalsSubtotalUsd,
      artistsSubtotalUsd: existing.artistsSubtotalUsd,
      crewSubtotalUsd: existing.crewSubtotalUsd,
      feesSubtotalUsd: existing.feesSubtotalUsd,
      subtotalUsd: existing.subtotalUsd,
      totalUsd: existing.totalUsd,
      notes: existing.notes,
      termsIds: existing.termsIds,
      termsId: undefined,
      additionalTermsMarkdown: existing.additionalTermsMarkdown,
      clientApprovalStatus: "pending",
      publicApprovalToken,
      publicApprovalTokenExpiresAt: publicApprovalToken ? publicApprovalTokenExpiry(now) : undefined,
      approvedAt: undefined,
      changesRequestedAt: undefined,
      clientApprovalNote: undefined,
      clientApprovalSignedName: undefined,
      clientReviewReadyAt: undefined,
      paymentFinanceContactEmail: undefined,
      clientIsPaymentSubmitter: undefined,
      paymentSubmitterName: undefined,
      paymentSubmitterEmail: undefined,
      payingPartyNotifiedEmail: undefined,
      payingPartyNotifiedAt: undefined,
      termsVersionAccepted: undefined,
      termsAcceptedAt: undefined,
      paymentReceivedAt: undefined,
      paymentReceivedByUserId: undefined,
      paymentReceiptStorageFileId: undefined,
      billableOccurrenceCountAtSave: undefined,
      createdAt: now,
      updatedAt: now,
    });
    for (const line of lineItems) {
      await ctx.db.insert("invoiceLineItems", {
        invoiceId: newId,
        section: line.section,
        order: line.order,
        provider: line.provider,
        label: line.label,
        notes: line.notes,
        quantity: line.quantity,
        rateUsd: line.rateUsd,
        amountUsd: line.amountUsd,
        packageId: line.packageId,
        typeId: line.typeId,
        excludedTypeIds: line.excludedTypeIds,
        packageOriginalRateUsd: line.packageOriginalRateUsd,
        packageExclusionDiscountUsd: line.packageExclusionDiscountUsd,
        feeDefinitionId: line.feeDefinitionId,
        equipmentQuantityBasis: line.equipmentQuantityBasis,
        organizationId: line.organizationId,
        memberCount: line.memberCount,
        performanceHours: line.performanceHours,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { id: newId, publicApprovalToken };
  },
});

export const createDraftForSeries = mutation({
  args: {
    seriesId: v.id("eventSeries"),
    managerUserId: v.string(),
    managerName: v.string(),
    managerEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const series = await ctx.db.get(args.seriesId);
    if (!series) throw new Error("Event series not found.");
    if (series.invoiceId) throw new Error("This series already has a linked invoice.");

    const publicApprovalToken = await generateUniquePublicApprovalToken(ctx);
    const now = Date.now();
    const issueDate = new Date().toISOString().slice(0, 10);
    const id = await ctx.db.insert("invoices", {
      invoiceNumber: await allocateInvoiceNumber(ctx),
      status: "draft",
      issueDate,
      managerUserId: args.managerUserId,
      managerName: args.managerName.trim(),
      managerEmail: trimOptional(args.managerEmail),
      equipmentPricingMode: "nonSubsidized",
      crewRateMode: "normal",
      discountType: "amount",
      discountValue: 0,
      discountAmountUsd: 0,
      equipmentSubtotalUsd: 0,
      externalRentalsSubtotalUsd: 0,
      artistsSubtotalUsd: 0,
      crewSubtotalUsd: 0,
      feesSubtotalUsd: 0,
      subtotalUsd: 0,
      totalUsd: 0,
      clientApprovalStatus: "pending",
      publicApprovalToken,
      publicApprovalTokenExpiresAt: publicApprovalTokenExpiry(now),
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.seriesId, { invoiceId: id, updatedAt: now });
    const occurrences = await ctx.db
      .query("events")
      .withIndex("by_seriesId_and_occurrenceIndex", (q) => q.eq("seriesId", args.seriesId))
      .take(200);
    for (const occurrence of occurrences) {
      if (occurrence.seriesDetached || occurrence.status === "cancelled") continue;
      await ctx.db.patch(occurrence._id, { invoiceId: id, updatedAt: now });
      await syncEventStatusForLinkedInvoice(ctx, occurrence._id, id, occurrence.status);
    }

    const billableCount = await resolveBillableOccurrenceCount(ctx, id);
    await ctx.db.patch(id, {
      billableOccurrenceCountAtSave: billableCount > 0 ? billableCount : undefined,
    });

    return { id, publicApprovalToken };
  },
});

export const markReadyForClientReview = mutation({
  args: {
    id: v.id("invoices"),
    clientMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found.");
    if (!invoice.sourceEventRequestId) {
      throw new Error("Only booking-request quotes can be sent on the request portal.");
    }
    if (invoice.status === "void") throw new Error("Cannot publish a void quote.");
    const clientReadyMessage = args.clientMessage.trim();
    if (!clientReadyMessage) {
      throw new Error("A message to the client is required before sending the quote.");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "finalized",
      clientReviewReadyAt: now,
      clientReadyMessage,
      updatedAt: now,
    });

    const updatedInvoice = await ctx.db.get(args.id);
    if (updatedInvoice?.sourceEventRequestId) {
      const request = await ctx.db.get(updatedInvoice.sourceEventRequestId);
      if (request) {
        await scheduleBookingQuoteReadyEmail(ctx, {
          request,
          invoice: {
            _id: updatedInvoice._id,
            invoiceNumber: updatedInvoice.invoiceNumber,
            totalUsd: updatedInvoice.totalUsd,
            managerName: updatedInvoice.managerName,
            managerEmail: updatedInvoice.managerEmail,
            clientReviewReadyAt: now,
            clientReadyMessage,
          },
        });
      }
    }

    return null;
  },
});

export const withdrawFromClientReview = mutation({
  args: { id: v.id("invoices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found.");
    if (!invoice.sourceEventRequestId) {
      throw new Error("Only booking-request quotes use the request portal.");
    }
    await ctx.db.patch(args.id, {
      status: "draft",
      clientReviewReadyAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

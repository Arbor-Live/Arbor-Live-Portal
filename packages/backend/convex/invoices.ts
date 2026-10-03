import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireArborInternalContext, requireAuth, findAuthUsersByIds } from "./lib/auth";
import { appError, withReportableErrors } from "./lib/errors";
import { resolveParticipationFlags } from "./lib/userParticipation";
import { isAlumniStatus, resolveUserStatus } from "./lib/userStatus";
import { loadActiveOrgMemberUserIds } from "./lib/orgMembership";
import { syncEventStatusForLinkedInvoice, syncLinkedEventStatusFromInvoice } from "./lib/eventStatus";
import { syncBookingRequestStatusFromInvoice } from "./lib/bookingRequestStatus";
import { recordInvoiceStatusTransition } from "./lib/statusTransitions";
import { listAdditionallyLinkedEvents } from "./lib/eventInvoiceLinks";
import { unclaimSlot, upsertEventBandParticipation } from "./eventBands";
import { listEventsByInvoiceId, listEventsLinkedToInvoice } from "./lib/invoiceEvents";
import {
  addPublicEventContact,
  deletePublicEventContact,
  requirePublicEditableEvent,
} from "./lib/publicEventContacts";
import { resolveArtistLineDayScope } from "./lib/invoiceArtistDays";
import { isMultiDayGroup, isRecurringGroup } from "./lib/eventGroupKind";
import { getActivePaymentProofSubmissionForInvoice, getPaymentProofOpensAt } from "./lib/paymentProof";
import { invoiceDueEndMs } from "./lib/invoicePaymentStatus";
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
import { syncLinkedEventsPrimaryHostFromInvoice } from "./lib/hostOrgs";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";
import {
  ensureApprovedRevision,
  listInvoiceRevisions,
  recordInvoiceRevision,
  snapshotFromRows,
  snapshotInvoice,
} from "./lib/invoiceRevisions";
import { scheduleQuoteUpdatedEmail } from "./email/quoteUpdatedEmails";
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
  buildUserProfileImageByUserId,
  loadAdminProfilesByUserIds,
} from "./lib/userProfileImage";
import {
  eventPassThroughCostUsd,
  invoicePassThroughUsd,
  netProfitFromInvoiceUsd,
} from "./lib/invoiceProfit";
import { deleteActBlocks, syncNeedBlocks } from "./lib/runOfShow";
import { ensureActPosition, returnActTimesToPosition } from "./lib/actPositions";
import {
  type AdoptablePosition,
  pickPositionForLine,
  scheduleSeedPayoutFromLine,
} from "./lib/artistLineSync";

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
  eventId: v.optional(v.id("events")),
  needId: v.optional(v.id("eventArtistNeeds")),
  memberCount: v.optional(v.number()),
  performanceHours: v.optional(v.number()),
  crewSource: v.optional(v.literal("manual")),
  /** Artist lines: a line added as a new act opens its own position (no adoption). */
  opensPosition: v.optional(v.boolean()),
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
  /** Artist lines: linked day/event on multi-day bookings. */
  eventId?: Id<"events">;
  /** Artist lines: the position this line stands for. */
  needId?: Id<"eventArtistNeeds">;
  /** Artist and crew lines: number of people. */
  memberCount?: number;
  /** Artist and crew lines: hours each person works or performs. */
  performanceHours?: number;
  /** Crew lines: hand-added hours on a linked quote (vs. generated from the schedule). */
  crewSource?: "manual";
  /** Artist lines: added as a new act, so it opens its own position (not stored). */
  opensPosition?: boolean;
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
  ctx: QueryCtx | MutationCtx,
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
  ctx: QueryCtx | MutationCtx,
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
  ctx: QueryCtx | MutationCtx,
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

/**
 * What the client agreed to on a quote: its lines and amounts, pricing and
 * discount, and terms. Manager, contact, due date and notes aren't part of it,
 * so they save freely on an approved quote.
 */
function approvalContentSignature(
  rows: Array<
    Pick<
      Doc<"invoiceLineItems">,
      | "section"
      | "label"
      | "provider"
      | "notes"
      | "quantity"
      | "rateUsd"
      | "amountUsd"
      | "equipmentQuantityBasis"
      | "memberCount"
      | "performanceHours"
    >
  >,
  invoice: Pick<
    Doc<"invoices">,
    "equipmentPricingMode" | "crewRateMode" | "discountType" | "discountValue" | "additionalTermsMarkdown"
  > & { termsIds: string[] },
) {
  // Order-independent: moving a line isn't a change the client needs to approve.
  const lines = rows
    .map((row) =>
      [
        row.section,
        row.label.trim(),
        row.provider?.trim() ?? "",
        row.notes?.trim() ?? "",
        row.quantity,
        Number(row.rateUsd.toFixed(2)),
        Number(row.amountUsd.toFixed(2)),
        row.equipmentQuantityBasis ?? "",
        row.memberCount ?? "",
        row.performanceHours ?? "",
      ].join("|"),
    )
    .sort();
  return JSON.stringify({
    lines,
    equipmentPricingMode: invoice.equipmentPricingMode,
    crewRateMode: invoice.crewRateMode,
    discountType: invoice.discountType,
    discountValue: Number(Math.max(0, invoice.discountValue).toFixed(2)),
    termsIds: [...invoice.termsIds].sort(),
    additionalTermsMarkdown: invoice.additionalTermsMarkdown?.trim() ?? "",
  });
}

const approvedChangeValue = v.object({
  decision: v.union(
    v.literal("request_reapproval"),
    v.literal("keep_approval"),
    /** Keep the new lines, and add a discount so the total stays what the client approved. */
    v.literal("match_approval"),
  ),
  /** Why it changed. Required to keep an approval; shown to the client either way. */
  note: v.optional(v.string()),
});

/** Refuse a change to an approved quote made outside the editor's decision flow. */
function assertApprovedQuoteUnchanged(
  invoice: Doc<"invoices">,
  before: Parameters<typeof approvalContentSignature>[0],
  after: Parameters<typeof approvalContentSignature>[0],
) {
  if ((invoice.clientApprovalStatus ?? "pending") !== "approved") return;
  const terms = { ...invoice, termsIds: resolveInvoiceTermsIds(invoice) };
  if (approvalContentSignature(before, terms) === approvalContentSignature(after, terms)) return;
  appError(
    "QUOTE_APPROVED_EDIT_IN_EDITOR",
    "This quote is approved, and this would change it. Make the change in the quote editor, where you can send it to the client for re-approval.",
  );
}

/** Back to awaiting approval: clears the client's decision, keeps the record of what they approved. */
async function resetInvoiceApproval(ctx: MutationCtx, invoice: Doc<"invoices">, at: number) {
  const fromStatus = invoice.clientApprovalStatus ?? "pending";
  await ctx.db.patch(invoice._id, {
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
    // Re-approval makes it an estimate again.
    billingFinalizedAt: undefined,
    billingFinalizedByName: undefined,
    updatedAt: at,
  });
  if (fromStatus !== "pending") {
    await recordInvoiceStatusTransition(ctx, invoice._id, fromStatus, "pending", { at });
  }
  await syncLinkedEventStatusFromInvoice(ctx, invoice._id, "pending");
  const updated = await ctx.db.get(invoice._id);
  if (updated?.sourceEventRequestId) {
    await syncBookingRequestStatusFromInvoice(ctx, updated, { at });
  }
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
    eventId: line.eventId,
    needId: line.needId,
    memberCount: line.memberCount,
    performanceHours: line.performanceHours,
    crewSource: line.crewSource,
  };
}


/** Positions on a day that no artist line stands for yet, for unlinked lines to adopt. */
async function listAdoptablePositions(
  ctx: MutationCtx,
  eventId: Id<"events">,
  invoiceId: Id<"invoices">,
  claimed: ReadonlySet<Id<"eventArtistNeeds">>,
): Promise<AdoptablePosition[]> {
  const slots = await ctx.db
    .query("eventArtistNeeds")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(100);
  const out: AdoptablePosition[] = [];
  for (const slot of slots) {
    if (claimed.has(slot._id)) continue;
    // Another invoice on this day (an extra invoice) may already bill it.
    const heldElsewhere = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_needId", (q) => q.eq("needId", slot._id))
      .take(10);
    if (heldElsewhere.some((line) => line.invoiceId !== invoiceId)) continue;
    const seated = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_needId", (q) => q.eq("needId", slot._id))
      .first();
    out.push({
      needId: slot._id,
      label: slot.label,
      seatedOrganizationId: seated?.organizationId,
      externalArtistName: slot.externalArtistName,
      sortOrder: slot.sortOrder ?? slot.createdAt,
    });
  }
  return out;
}

/**
 * Keep `eventArtistNeeds` in step with the invoice's artist lines: a line tied
 * to a day stands for a position there, and an assigned line books it.
 *
 * A line without a position first adopts one the day already has (its act's,
 * one with its name, then the first empty one) and only opens a new position
 * when the bill has none to spare — so a quote fills the event's bill instead
 * of adding duplicates to it. A line whose position staff removed on the event
 * (`positionRemoved`) adopts only an exact match and never opens a new one.
 * Lines in `opensPosition` were added as new acts and always open their own.
 */
async function syncArtistSlotsForInvoice(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  now: number,
  opensPosition: ReadonlySet<Id<"invoiceLineItems">> = new Set(),
) {
  const lines = (
    await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
      .take(500)
  ).filter((line) => line.section === "artist" && line.eventId);

  const claimed = new Set<Id<"eventArtistNeeds">>();
  const slotIdByLine = new Map<Id<"invoiceLineItems">, Id<"eventArtistNeeds">>();
  for (const line of lines) {
    const linked = line.needId ? await ctx.db.get(line.needId) : null;
    // A position stands for one line. A duplicate id is treated as unlinked, so
    // the second line finds its own instead of shadowing the first.
    if (linked && linked.eventId === line.eventId && !claimed.has(linked._id)) {
      claimed.add(linked._id);
      slotIdByLine.set(line._id, linked._id);
    }
  }

  const unlinked = lines.filter(
    (line) => !slotIdByLine.has(line._id) && !opensPosition.has(line._id),
  );
  const candidatesByEvent = new Map<Id<"events">, AdoptablePosition[]>();
  for (const line of unlinked) {
    if (!candidatesByEvent.has(line.eventId!)) {
      candidatesByEvent.set(
        line.eventId!,
        await listAdoptablePositions(ctx, line.eventId!, invoiceId, claimed),
      );
    }
  }
  // Exact matches across every line first, so a loose match can't take the
  // position another line names.
  for (const exact of [true, false]) {
    for (const line of unlinked) {
      if (slotIdByLine.has(line._id)) continue;
      if (!exact && line.positionRemoved) continue;
      const candidates = (candidatesByEvent.get(line.eventId!) ?? []).filter(
        (slot) => !claimed.has(slot.needId),
      );
      const pick = pickPositionForLine(line, candidates, exact);
      if (!pick) continue;
      claimed.add(pick.needId);
      slotIdByLine.set(line._id, pick.needId);
    }
  }

  for (const line of lines) {
    let slotId = slotIdByLine.get(line._id);
    if (!slotId) {
      if (line.positionRemoved) continue;
      slotId = await ctx.db.insert("eventArtistNeeds", {
        eventId: line.eventId!,
        label: trimOptional(line.label),
        artistType: "no_preference",
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
      claimed.add(slotId);
    }
    if (line.needId !== slotId || line.positionRemoved) {
      const next: Doc<"invoiceLineItems"> = { ...line, needId: slotId, updatedAt: now };
      delete next.positionRemoved;
      await ctx.db.replace(line._id, next);
    }
    const slot = await ctx.db.get(slotId);
    if (!slot) continue;
    // An outside act already fills this position; the line still bills for its
    // own act, and saving an invoice must never fail on that disagreement.
    if (slot.externalArtistName?.trim()) continue;

    // An act named on the line is booked on the bill too, so it reaches the
    // lineup, the band dashboard and media rather than only the invoice.
    const organizationId = line.organizationId?.trim();
    const seated = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_needId", (q) => q.eq("needId", slot._id))
      .first();
    if (!organizationId) {
      // Back to TBD: the act stays on the bill, but no longer holds the position.
      if (seated) {
        await unclaimSlot(ctx, seated._id);
        // Every act fills a position: the act gets its own, and the reopened
        // one shows its own run-of-show times again.
        await ensureActPosition(ctx, seated._id);
        await syncNeedBlocks(ctx, slot._id);
      }
      continue;
    }
    if (seated?.organizationId === organizationId) {
      // Priced after the act was booked: the payout can start from this price.
      await scheduleSeedPayoutFromLine(ctx, slot._id);
      continue;
    }
    const current = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId_and_organizationId", (q) =>
        q.eq("eventId", line.eventId!).eq("organizationId", organizationId),
      )
      .unique();
    await upsertEventBandParticipation(ctx, {
      eventId: line.eventId!,
      organizationId,
      role: current?.role ?? "headliner",
      needId: slot._id,
    });
  }
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
  const artistEventIds = [
    ...new Set(
      rows
        .filter((row) => row.section === "artist" && row.eventId)
        .map((row) => row.eventId!),
    ),
  ];
  if (artistEventIds.length) {
    const linkedEventIds = new Set(
      (await listEventsByInvoiceId(ctx, invoiceId)).map((event) => event._id),
    );
    const orphan = artistEventIds.find((eventId) => !linkedEventIds.has(eventId));
    if (orphan) {
      throw new Error("Artist line is linked to an event that is not on this invoice.");
    }
  }
  const existing = await ctx.db
    .query("invoiceLineItems")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(500);
  const previousNeedIds = existing.flatMap((row) =>
    row.section === "artist" && row.needId ? [row.needId] : [],
  );
  // The editor hydrates once, so it posts the same lines without `needId` on
  // every later save. Reuse the position a line already had (same event and
  // order) instead of minting a new one and stranding the old.
  const previousLineByKey = new Map<
    string,
    {
      needId?: Id<"eventArtistNeeds">;
      positionRemoved?: boolean;
      label: string;
      organizationId?: string;
    }
  >();
  for (const row of existing) {
    if (row.section === "artist" && row.eventId && (row.needId || row.positionRemoved)) {
      previousLineByKey.set(`${row.eventId}:${row.order}`, {
        needId: row.needId,
        positionRemoved: row.positionRemoved,
        label: row.label,
        organizationId: row.organizationId,
      });
    }
  }
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  const now = Date.now();
  const opensPosition = new Set<Id<"invoiceLineItems">>();
  for (const row of rows.sort((a, b) => a.order - b.order)) {
    // Only reuse the previous position when this slot is the same act, so a row
    // shifting into another's order cannot adopt its position and inquiries.
    const previous =
      row.section === "artist" && row.eventId
        ? previousLineByKey.get(`${row.eventId}:${row.order}`)
        : undefined;
    const sameLine =
      previous &&
      previous.label === row.label.trim() &&
      previous.organizationId === trimOptional(row.organizationId);
    // An editor opened before staff removed this line's position still posts
    // its id; the removal stands rather than the save opening it again.
    const postedNeedGone =
      row.section === "artist" && row.needId ? !(await ctx.db.get(row.needId)) : false;
    const needId =
      row.section === "artist" && row.eventId && !postedNeedGone
        ? (row.needId ?? (sameLine ? previous.needId : undefined))
        : undefined;
    const positionRemoved =
      row.section === "artist" && row.eventId && !needId
        ? postedNeedGone || (sameLine && previous.positionRemoved) || undefined
        : undefined;
    const lineId = await ctx.db.insert("invoiceLineItems", {
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
      eventId: row.section === "artist" ? row.eventId : undefined,
      // A position only means something next to an event; an unscoped artist row
      // must not keep one alive.
      needId,
      positionRemoved,
      // Artist and crew lines keep their people × hours split; `quantity` is still
      // the billed person-hours.
      memberCount:
        (row.section === "artist" || row.section === "crew") &&
        row.memberCount !== undefined &&
        row.memberCount > 0
          ? row.memberCount
          : undefined,
      performanceHours:
        (row.section === "artist" || row.section === "crew") &&
        row.performanceHours !== undefined &&
        row.performanceHours > 0
          ? row.performanceHours
          : undefined,
      crewSource: row.section === "crew" ? row.crewSource : undefined,
      createdAt: now,
      updatedAt: now,
    });
    if (row.section === "artist" && row.opensPosition && !needId) opensPosition.add(lineId);
  }

  await syncArtistSlotsForInvoice(ctx, invoiceId, now, opensPosition);

  // A line the editor dropped leaves its position on the bill: the quote only
  // stops pricing it (staff remove positions from the event explicitly). A line
  // moved to another day takes the position it opened with it, unless that
  // position carries inquiries of its own or the act is still billed on that
  // day by a surviving line.
  const movedNeedIds = new Set(
    rows.flatMap((row) => (row.section === "artist" && row.needId ? [row.needId] : [])),
  );
  const surviving = await ctx.db
    .query("invoiceLineItems")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(500);
  const kept = new Set(surviving.flatMap((row) => (row.needId ? [row.needId] : [])));
  const stillBilledOn = new Set(
    surviving.flatMap((row) =>
      row.section === "artist" && row.eventId && row.organizationId
        ? [`${row.eventId}:${row.organizationId}`]
        : [],
    ),
  );
  // The act each departing line claimed its position with, so we can tell the
  // claim this invoice made from a booking somebody else made.
  const departedOrgByNeed = new Map<Id<"eventArtistNeeds">, string>();
  for (const row of existing) {
    if (row.section === "artist" && row.needId && row.organizationId) {
      departedOrgByNeed.set(row.needId, row.organizationId);
    }
  }
  for (const needId of previousNeedIds) {
    if (kept.has(needId) || !movedNeedIds.has(needId)) continue;
    const slot = await ctx.db.get(needId);
    if (!slot) continue;
    // Filled by an outside act — the line is gone, the booking is not.
    if (slot.externalArtistName?.trim()) continue;
    const filled = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_needId", (q) => q.eq("needId", needId))
      .first();
    if (filled) {
      const departedOrg = departedOrgByNeed.get(needId);
      // A booking for another act is not ours to remove, and an act another
      // surviving line still bills on this day keeps its seat.
      if (
        !departedOrg ||
        filled.organizationId !== departedOrg ||
        stillBilledOn.has(`${slot.eventId}:${departedOrg}`)
      ) {
        continue;
      }
      await returnActTimesToPosition(ctx, filled);
      await ctx.db.delete(filled._id);
      await deleteActBlocks(ctx, { participationId: filled._id });
    }
    const inquiries = await ctx.db
      .query("eventArtistInquiries")
      .withIndex("by_needId", (q) => q.eq("needId", needId))
      .take(1);
    if (inquiries.length > 0) {
      // The position stays (its inquiries are kept) and is open again.
      await syncNeedBlocks(ctx, needId);
      continue;
    }
    await ctx.db.delete(needId);
    await deleteActBlocks(ctx, { needId });
  }
}

export const listManagers = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const orgContext = await requireArborInternalContext(ctx);
    const orgUserIds = await loadActiveOrgMemberUserIds(ctx, orgContext.organizationId);
    const userByKey = await findAuthUsersByIds(ctx, [...orgUserIds]);
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
    const profileByUserId = await loadAdminProfilesByUserIds(ctx, [...orgUserIds]);
    const imageByUserId = await buildUserProfileImageByUserId(
      ctx,
      [...orgUserIds],
      userByKey,
      profileByUserId,
    );
    return [...orgUserIds]
      .map((userId) => {
        const user = userByKey.get(userId);
        if (!user) return null;
        const profile = profileByUserId.get(userId);
        // Alumni keep no dashboard access and are not selectable for events;
        // inactive crew stay assignable and are flagged in the picker.
        if (isAlumniStatus(resolveUserStatus(profile))) {
          return null;
        }
        if (profile && !resolveParticipationFlags(profile).assignableAsCrew) {
          return null;
        }
        const compensation = rateByUserId.get(userId);
        const avatarUrl = imageByUserId.get(userId);
        return {
          id: userId,
          name: user.name ?? user.email ?? "Unknown user",
          email: user.email,
          role: user.role ?? undefined,
          status: resolveUserStatus(profile),
          image: user.image ?? undefined,
          avatarUrl,
          hourlyRateUsd: compensation?.hourlyRateUsd,
          rateMode: compensation?.rateMode,
          pronouns: profile?.pronouns ?? undefined,
          gradYear: profile?.gradYear ?? undefined,
        };
      })
      .filter((user): user is NonNullable<typeof user> => user !== null)
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
  excludeClosed = false,
) {
  if (status) {
    return await ctx.db
      .query("invoices")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", status))
      .order("desc")
      .take(INVOICE_LIST_LIMIT);
  }
  if (excludeClosed) {
    // Active view: everything except void, and except paid (payment received).
    // Merge the two live statuses recency-first, then drop paid so the cap is
    // spent on rows the default view actually shows.
    const draft = await ctx.db
      .query("invoices")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "draft"))
      .order("desc")
      .take(INVOICE_LIST_LIMIT);
    const finalized = await ctx.db
      .query("invoices")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "finalized"))
      .order("desc")
      .take(INVOICE_LIST_LIMIT);
    return [...draft, ...finalized]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((invoice) => !invoice.paymentReceivedAt)
      .slice(0, INVOICE_LIST_LIMIT);
  }
  return await ctx.db
    .query("invoices")
    .withIndex("by_createdAt")
    .order("desc")
    .take(INVOICE_LIST_LIMIT);
}

/**
 * Series / linked-event labels for the invoice list. Deliberately lighter than
 * `resolveSeriesMetadataForInvoice`, which scans up to 200 series occurrences
 * per invoice to compute counts the list never renders.
 */
async function resolveInvoiceListLabels(ctx: QueryCtx, invoiceId: Id<"invoices">) {
  const series = await findSeriesByInvoiceId(ctx, invoiceId);
  const linkedEvents = await listEventsLinkedToInvoice(ctx, invoiceId);
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
      primaryEvent,
    };
  }
  const seriesIds = [
    ...new Set(
      linkedEvents.map((row) => row.seriesId).filter((id): id is Id<"eventSeries"> => Boolean(id)),
    ),
  ];
  const seriesDoc = seriesIds.length === 1 ? await ctx.db.get(seriesIds[0]!) : null;
  return {
    seriesTitle: seriesDoc && isRecurringGroup(seriesDoc) ? seriesDoc.title : undefined,
    linkedEventTitle: linkedEvents[0]?.title,
    eventCostsUsd,
    eventPassThroughCostsUsd,
    primaryEvent,
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

const DAY_MS = 24 * 60 * 60 * 1000;

type InvoiceListPaymentStatus =
  | "estimate"
  | "ready_to_finalize"
  | "payment_pending"
  | "proof_received"
  | "overdue"
  | "paid";

/**
 * Payment status for the invoice list, computed only for approved quotes:
 * `paid` once money landed on our account; while it's still an estimate,
 * `estimate` before the event ends and `ready_to_finalize` after (staff owe
 * the final invoice); then `overdue` past the due date
 * (counting days since), `proof_received` when the client submitted payment
 * proof we haven't confirmed yet, else `payment_pending`. Non-approved quotes
 * (draft / awaiting approval / changes requested) return null.
 */
async function resolveInvoiceListPaymentStatus(
  ctx: QueryCtx,
  invoice: Doc<"invoices">,
  primaryEvent: Doc<"events"> | undefined,
): Promise<{ paymentStatus: InvoiceListPaymentStatus | null; daysOverdue: number }> {
  if ((invoice.clientApprovalStatus ?? "pending") !== "approved") {
    return { paymentStatus: null, daysOverdue: 0 };
  }
  if (invoice.paymentReceivedAt) {
    return { paymentStatus: "paid", daysOverdue: 0 };
  }
  const now = Date.now();
  const activeSubmission = await getActivePaymentProofSubmissionForInvoice(ctx, invoice._id);
  if (getPaymentProofOpensAt(invoice) == null && !activeSubmission) {
    const eventEnded = primaryEvent ? primaryEvent.endAt < now : false;
    return { paymentStatus: eventEnded ? "ready_to_finalize" : "estimate", daysOverdue: 0 };
  }
  const dueEndMs = invoiceDueEndMs(invoice, primaryEvent?.timezone);
  if (dueEndMs != null && now > dueEndMs) {
    return {
      paymentStatus: "overdue",
      daysOverdue: Math.max(0, Math.floor((now - dueEndMs) / DAY_MS) + 1),
    };
  }
  return {
    paymentStatus: activeSubmission ? "proof_received" : "payment_pending",
    daysOverdue: 0,
  };
}

/**
 * Invoice list rows. Returns an explicit slim projection rather than spreading
 * the whole doc — the list table renders seven columns, not sixty fields.
 */
export const listEnriched = query({
  args: {
    status: v.optional(invoiceListStatusValue),
    // Active view (default): drop void and paid before the recency cap applies.
    excludeClosed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const rows = await recentInvoices(ctx, args.status, args.excludeClosed);
    return await Promise.all(
      rows.map(async (invoice) => {
        const {
          seriesTitle,
          linkedEventTitle,
          eventCostsUsd,
          eventPassThroughCostsUsd,
          primaryEvent,
        } = await resolveInvoiceListLabels(ctx, invoice._id);
        const { paymentStatus, daysOverdue } = await resolveInvoiceListPaymentStatus(
          ctx,
          invoice,
          primaryEvent,
        );
        return {
          _id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          clientApprovalStatus: invoice.clientApprovalStatus,
          paymentReceivedAt: invoice.paymentReceivedAt,
          billingFinalizedAt: invoice.billingFinalizedAt,
          paymentStatus,
          daysOverdue,
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
          clientReviewReadyAt: invoice.clientReviewReadyAt,
          changesRequestedAt: invoice.changesRequestedAt,
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
    const additionallyLinkedEvents = (await listAdditionallyLinkedEvents(ctx, args.id)).map(
      (event) => ({
        _id: event._id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
      }),
    );
    return { invoice, lineItems, series, additionallyLinkedEvents };
  },
});

/** The quote's versions, newest first: approvals and every change after one. */
export const listRevisions = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await listInvoiceRevisions(ctx, args.id);
  },
});

/**
 * Price an unsaved draft exactly as a save would, next to what the client
 * approved, so the editor can show the change before anyone commits to it.
 * `approved` is null when the quote isn't approved. For quotes approved
 * before revisions existed, it's the quote as currently saved.
 */
export const previewApprovedChange = query({
  args: {
    id: v.id("invoices"),
    equipmentPricingMode: equipmentPricingModeValue,
    crewRateMode: crewRateModeValue,
    discountType: discountTypeValue,
    discountValue: v.number(),
    lineItems: v.array(lineItemInput),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const invoice = await ctx.db.get(args.id);
    if (!invoice || (invoice.clientApprovalStatus ?? "pending") !== "approved") {
      return { approved: null, proposed: null };
    }
    const approvedRevision = invoice.approvedRevisionId ? await ctx.db.get(invoice.approvedRevisionId) : null;
    const approvedSnapshot = approvedRevision ?? (await snapshotInvoice(ctx, invoice));
    const totals = await computeTotals(
      ctx,
      args.lineItems as LineInput[],
      args.equipmentPricingMode,
      args.crewRateMode,
      args.discountType,
      args.discountValue,
      args.id,
    );
    const billableOccurrenceCount = await resolveBillableOccurrenceCount(ctx, args.id);
    const proposed = snapshotFromRows(totals.normalized, billableOccurrenceCount, {
      discountType: args.discountType,
      discountValue: args.discountValue,
    });
    return {
      approved: {
        number: approvedRevision?.number ?? null,
        totalUsd: approvedSnapshot.totalUsd,
        lines: approvedSnapshot.lines,
        approvedAt: invoice.approvedAt ?? approvedRevision?.createdAt ?? null,
        approvedBy: invoice.clientApprovalSignedName ?? approvedRevision?.actorName ?? null,
        recordedLate: approvedRevision ? Boolean(approvedRevision.recordedLate) : true,
      },
      proposed,
    };
  },
});

/**
 * How artist lines scope to days on this invoice: the fallback day for unscoped
 * lines (the first linked event) and whether one recurring series owns every day.
 */
export const getArtistLineDayScope = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.object({
    firstEventId: v.union(v.id("events"), v.null()),
    unscopedAppliesToEveryDay: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const events = await listEventsByInvoiceId(ctx, args.invoiceId);
    const scope = await resolveArtistLineDayScope(ctx, events);
    return {
      firstEventId: scope.firstEventId ?? null,
      unscopedAppliesToEveryDay: scope.unscopedAppliesToEveryDay,
    };
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
    return await withReportableErrors("invoices.createDraft", async () => {
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
    });
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
    /**
     * Required when the save changes what an approved client agreed to (see
     * `approvalContentSignature`): send it back for approval, or keep the
     * approval with a reason. Without it, such a save is refused, so a quote
     * can never change under an approval by accident.
     */
    approvedChange: v.optional(approvedChangeValue),
  },
  handler: async (ctx, args) => {
    const viewer = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await withReportableErrors("invoices.updateDraft", async () => {
    const existing = await ctx.db.get(args.id);
    if (!existing) appError("INVOICE_NOT_FOUND", "Invoice not found.");
    const publicApprovalToken = existing.sourceEventRequestId
      ? undefined
      : existing.publicApprovalToken || (await generateUniquePublicApprovalToken(ctx));
    // Only start a fresh expiry window when we mint a brand-new token; editing an
    // invoice that already has a live link must not silently extend it.
    const mintedNewToken = Boolean(publicApprovalToken) && !existing.publicApprovalToken;
    const normalizedTermsIds = normalizeTermsIds(args.termsIds);
    let totals = await computeTotals(
      ctx,
      args.lineItems as LineInput[],
      args.equipmentPricingMode,
      args.crewRateMode,
      args.discountType,
      args.discountValue,
      args.id,
    );
    let discountType = args.discountType;
    let discountValue = args.discountValue;
    const now = Date.now();

    const beforeRows = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", args.id))
      .take(500);
    const approvedContentChanged =
      (existing.clientApprovalStatus ?? "pending") === "approved" &&
      approvalContentSignature(beforeRows, {
        ...existing,
        termsIds: resolveInvoiceTermsIds(existing),
      }) !==
        approvalContentSignature(totals.normalized, {
          equipmentPricingMode: args.equipmentPricingMode,
          crewRateMode: args.crewRateMode,
          discountType: args.discountType,
          discountValue: args.discountValue,
          additionalTermsMarkdown: args.additionalTermsMarkdown,
          termsIds: normalizedTermsIds ?? [],
        });
    const approvedChange = approvedContentChanged ? args.approvedChange : undefined;
    if (approvedContentChanged && existing.billingFinalizedAt) {
      appError("INVOICE_FINAL_REOPEN_TO_CHANGE", "This is the final invoice. Reopen it to make changes.");
    }
    if (approvedContentChanged) {
      if (!approvedChange) {
        appError(
          "QUOTE_APPROVED_CHANGE_NEEDS_DECISION",
          "This quote is approved. Choose whether to send the changes to the client for re-approval or keep the approval.",
        );
      }
      if (approvedChange.decision === "keep_approval" && !approvedChange.note?.trim()) {
        appError("QUOTE_KEEP_APPROVAL_NOTE_REQUIRED", "Say why the client's approval still stands.");
      }
      // Pin what the client approved before this change replaces it.
      await ensureApprovedRevision(ctx, existing);
      if (approvedChange.decision === "match_approval") {
        const pinned = await ctx.db.get(args.id);
        const approvedTotalUsd = pinned?.approvedTotalUsd ?? existing.totalUsd;
        if (totals.totalUsd <= approvedTotalUsd) {
          appError(
            "QUOTE_MATCH_APPROVAL_NOT_HIGHER",
            "The total didn't go up, so there's nothing to discount back to the approved amount.",
          );
        }
        // One amount discount covering everything above the approved total
        // (it replaces any earlier discount, which it already includes).
        discountType = "amount";
        discountValue = Number(Math.max(0, totals.subtotalUsd - approvedTotalUsd).toFixed(2));
        totals = await computeTotals(
          ctx,
          args.lineItems as LineInput[],
          args.equipmentPricingMode,
          args.crewRateMode,
          discountType,
          discountValue,
          args.id,
        );
      }
    }

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
      discountType,
      discountValue: Math.max(0, discountValue),
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
    if (args.groupId !== existing.groupId) {
      await syncLinkedEventsPrimaryHostFromInvoice(ctx, args.id);
    }

    let revision: { number: number; kind: Doc<"invoiceRevisions">["kind"] } | null = null;
    if (approvedChange) {
      const saved = await ctx.db.get(args.id);
      if (!saved) appError("INVOICE_NOT_FOUND", "Invoice not found.");
      const snapshot = await snapshotInvoice(ctx, saved);
      const kind =
        approvedChange.decision === "request_reapproval"
          ? "reapproval_requested"
          : approvedChange.decision === "match_approval"
            ? "matched_approval"
            : "change_kept_approval";
      const matchedNote =
        kind === "matched_approval"
          ? `Discounted $${discountValue.toFixed(2)} to keep the approved total.`
          : undefined;
      const { number } = await recordInvoiceRevision(ctx, args.id, snapshot, {
        kind,
        at: now,
        note: [approvedChange.note?.trim(), matchedNote].filter(Boolean).join(" ") || undefined,
        actorName: viewer.name,
        actorUserId: viewer._id ?? viewer.id,
      });
      revision = { number, kind };
      if (kind === "reapproval_requested") {
        await resetInvoiceApproval(ctx, saved, now);
        await scheduleQuoteUpdatedEmail(ctx, {
          invoice: saved,
          previousTotalUsd: saved.approvedTotalUsd ?? existing.totalUsd,
          newTotalUsd: snapshot.totalUsd,
          changeNote: approvedChange.note?.trim() || undefined,
          revisionNumber: number,
        });
      }
    }
    return {
      id: args.id,
      warning: totals.discountWarning,
      revision,
      /** Set when the server rewrote the discount (match_approval); the editor adopts it. */
      appliedDiscount:
        revision?.kind === "matched_approval" ? { discountType: "amount" as const, discountValue } : null,
    };
    });
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
    return await withReportableErrors("invoices.approveByToken", async () => {
      const invoice = await ctx.db
        .query("invoices")
        .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", args.token))
        .unique();
      if (!invoice) appError("QUOTE_NOT_FOUND", "Quote not found.");
      if (invoice.sourceEventRequestId) {
        appError(
          "QUOTE_USE_BOOKING_LINK",
          "Please review this quote from your booking request link.",
        );
      }
      if (invoice.publicApprovalTokenExpiresAt && invoice.publicApprovalTokenExpiresAt < Date.now()) {
        appError("QUOTE_NOT_FOUND", "Quote not found.");
      }
      await approveInvoiceQuote(ctx, invoice, args);
      return { ok: true };
    });
  },
});

export const requestChangesByToken = mutation({
  args: { token: v.string(), note: v.string() },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `quoteToken:${args.token}`, { limit: 30, windowMs: HOUR_MS });
    return await withReportableErrors("invoices.requestChangesByToken", async () => {
      const invoice = await ctx.db
        .query("invoices")
        .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", args.token))
        .unique();
      if (!invoice) appError("QUOTE_NOT_FOUND", "Quote not found.");
      if (invoice.sourceEventRequestId) {
        appError(
          "QUOTE_USE_BOOKING_LINK",
          "Please review this quote from your booking request link.",
        );
      }
      if (invoice.publicApprovalTokenExpiresAt && invoice.publicApprovalTokenExpiresAt < Date.now()) {
        appError("QUOTE_NOT_FOUND", "Quote not found.");
      }
      await requestInvoiceQuoteChanges(ctx, invoice, args.note);
      return { ok: true };
    });
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

/** Client-facing event contacts: view any time, add/delete once the quote is approved. */
export const addEventContactByToken = mutation({
  args: {
    token: v.string(),
    eventId: v.id("events"),
    name: v.string(),
    position: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `publicEventContacts:${args.token}`, { limit: 60, windowMs: HOUR_MS });
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", args.token))
      .unique();
    if (!invoice || invoice.status === "void") throw new Error("Quote not found.");
    if (invoice.sourceEventRequestId) {
      throw new Error("Please review this quote from your booking request link.");
    }
    if (invoice.publicApprovalTokenExpiresAt && invoice.publicApprovalTokenExpiresAt < Date.now()) {
      throw new Error("Quote not found.");
    }
    await requirePublicEditableEvent(ctx, invoice, args.eventId);
    await addPublicEventContact(ctx, args.eventId, {
      name: args.name,
      position: args.position,
      email: args.email,
      phone: args.phone,
    });
    return { ok: true as const };
  },
});

export const deleteEventContactByToken = mutation({
  args: {
    token: v.string(),
    eventId: v.id("events"),
    contactId: v.id("eventContacts"),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `publicEventContacts:${args.token}`, { limit: 60, windowMs: HOUR_MS });
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", args.token))
      .unique();
    if (!invoice || invoice.status === "void") throw new Error("Quote not found.");
    if (invoice.sourceEventRequestId) {
      throw new Error("Please review this quote from your booking request link.");
    }
    if (invoice.publicApprovalTokenExpiresAt && invoice.publicApprovalTokenExpiresAt < Date.now()) {
      throw new Error("Quote not found.");
    }
    await requirePublicEditableEvent(ctx, invoice, args.eventId);
    await deletePublicEventContact(ctx, args.eventId, args.contactId);
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
    await resetInvoiceApproval(ctx, invoice, Date.now());
    return { ok: true };
  },
});

/**
 * Settle an approved estimate into the final invoice (after the event, once
 * hours are final): snapshots a `final` version and opens payment. The first
 * payment reminder then tells the client it's ready.
 */
export const finalizeBilling = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const viewer = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await withReportableErrors("invoices.finalizeBilling", async () => {
      const invoice = await ctx.db.get(args.id);
      if (!invoice) appError("INVOICE_NOT_FOUND", "Invoice not found.");
      if (invoice.status === "void") appError("INVOICE_VOID", "This invoice is void.");
      if ((invoice.clientApprovalStatus ?? "pending") !== "approved") {
        appError("INVOICE_NOT_APPROVED", "The client has to approve the quote before it can be finalized.");
      }
      if (invoice.billingFinalizedAt) return { number: null };
      const now = Date.now();
      await ensureApprovedRevision(ctx, invoice);
      const snapshot = await snapshotInvoice(ctx, invoice);
      const { number } = await recordInvoiceRevision(ctx, args.id, snapshot, {
        kind: "final",
        at: now,
        actorName: viewer.name,
        actorUserId: viewer._id ?? viewer.id,
      });
      await ctx.db.patch(args.id, {
        billingFinalizedAt: now,
        billingFinalizedByName: viewer.name,
        updatedAt: now,
      });
      return { number };
    });
  },
});

/**
 * Undo `finalizeBilling` to correct the invoice. Refused once it's paid, or
 * while the client's payment proof for the final amount is pending: changing
 * the amount under a submitted proof would leave the two disagreeing.
 */
export const reopenBilling = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await withReportableErrors("invoices.reopenBilling", async () => {
      const invoice = await ctx.db.get(args.id);
      if (!invoice) appError("INVOICE_NOT_FOUND", "Invoice not found.");
      if (invoice.paymentReceivedAt) {
        appError("INVOICE_PAID", "This invoice is paid, so it can't be reopened.");
      }
      if (await getActivePaymentProofSubmissionForInvoice(ctx, invoice._id)) {
        appError(
          "INVOICE_PROOF_SUBMITTED",
          "The client already submitted payment proof for this invoice. Verify or invalidate it before reopening.",
        );
      }
      await ctx.db.patch(args.id, {
        billingFinalizedAt: undefined,
        billingFinalizedByName: undefined,
        updatedAt: Date.now(),
      });
      return null;
    });
  },
});

/** Let the client pay before the final invoice (a deposit or prepayment), or take that back. */
export const setPaymentOpenedEarly = mutation({
  args: { id: v.id("invoices"), open: v.boolean(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await withReportableErrors("invoices.setPaymentOpenedEarly", async () => {
      const invoice = await ctx.db.get(args.id);
      if (!invoice) appError("INVOICE_NOT_FOUND", "Invoice not found.");
      const now = Date.now();
      if (args.open) {
        const note = args.note?.trim();
        if (!note) appError("PAYMENT_EARLY_NOTE_REQUIRED", "Say why payment opens before the final invoice.");
        await ctx.db.patch(args.id, {
          paymentOpenedEarlyAt: now,
          paymentOpenedEarlyByName: viewer.name,
          paymentOpenedEarlyNote: note,
          updatedAt: now,
        });
      } else {
        // Same reasoning as reopenBilling: don't close payment under a pending proof.
        if (await getActivePaymentProofSubmissionForInvoice(ctx, invoice._id)) {
          appError(
            "INVOICE_PROOF_SUBMITTED",
            "The client already submitted payment proof. Verify or invalidate it before closing payment.",
          );
        }
        await ctx.db.patch(args.id, {
          paymentOpenedEarlyAt: undefined,
          paymentOpenedEarlyByName: undefined,
          paymentOpenedEarlyNote: undefined,
          updatedAt: now,
        });
      }
      return null;
    });
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
    assertApprovedQuoteUnchanged(invoice, lineItems, totals.normalized);
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
    return await withReportableErrors("invoices.finalize", async () => {
    const invoice = await ctx.db.get(args.id);
    if (!invoice) appError("INVOICE_NOT_FOUND", "Invoice not found.");
    await ctx.db.patch(args.id, { status: "finalized", updatedAt: Date.now() });
    });
  },
});

export const voidInvoice = mutation({
  args: { id: v.id("invoices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await withReportableErrors("invoices.voidInvoice", async () => {
    const invoice = await ctx.db.get(args.id);
    if (!invoice) appError("INVOICE_NOT_FOUND", "Invoice not found.");
    if (invoice.status === "void") appError("INVOICE_ALREADY_VOID", "Invoice is already void.");
    const now = Date.now();
    await ctx.db.patch(args.id, { status: "void", updatedAt: now });
    const voided = await ctx.db.get(args.id);
    if (voided) {
      await syncBookingRequestStatusFromInvoice(ctx, voided, { at: now });
    }
    return null;
    });
  },
});

export const unvoidInvoice = mutation({
  args: { id: v.id("invoices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await withReportableErrors("invoices.unvoidInvoice", async () => {
    const invoice = await ctx.db.get(args.id);
    if (!invoice) appError("INVOICE_NOT_FOUND", "Invoice not found.");
    if (invoice.status !== "void") appError("INVOICE_NOT_VOID", "Invoice is not void.");
    // Restore published/approved work to finalized; otherwise back to draft.
    const nextStatus =
      invoice.clientReviewReadyAt ||
      invoice.approvedAt ||
      invoice.paymentReceivedAt ||
      invoice.clientApprovalStatus === "approved"
        ? "finalized"
        : "draft";
    const now = Date.now();
    await ctx.db.patch(args.id, { status: nextStatus, updatedAt: now });
    const restored = await ctx.db.get(args.id);
    if (restored) {
      await syncBookingRequestStatusFromInvoice(ctx, restored, { at: now });
    }
    return null;
    });
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
    assertApprovedQuoteUnchanged(invoice, lineItems, totals.normalized);
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
    const useSeriesQty = Boolean(
      series && isRecurringGroup(series) && series.invoiceId === args.id,
    );
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
    assertApprovedQuoteUnchanged(invoice, lineItems, totals.normalized);
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
        crewSource: line.crewSource,
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
    if (isMultiDayGroup(series)) {
      throw new Error("A multi-day booking is billed through its days' invoice.");
    }
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
    return await withReportableErrors("invoices.markReadyForClientReview", async () => {
    const invoice = await ctx.db.get(args.id);
    if (!invoice) appError("INVOICE_NOT_FOUND", "Invoice not found.");
    if (!invoice.sourceEventRequestId) {
      appError(
        "QUOTE_NOT_BOOKING_REQUEST",
        "Only booking-request quotes can be sent on the request portal.",
      );
    }
    if (invoice.status === "void") {
      appError("INVOICE_VOID", "Cannot publish a void quote.");
    }
    const clientReadyMessage = args.clientMessage.trim();
    if (!clientReadyMessage) {
      appError(
        "QUOTE_MESSAGE_REQUIRED",
        "A message to the client is required before sending the quote.",
      );
    }
    if (resolveInvoiceTermsIds(invoice).length === 0) {
      appError(
        "QUOTE_TERMS_REQUIRED",
        "Select at least one terms template before sending the quote.",
      );
    }
    const now = Date.now();
    const fromApprovalStatus = invoice.clientApprovalStatus ?? "pending";
    const resetAfterChangesRequested = fromApprovalStatus === "changes_requested";
    await ctx.db.patch(args.id, {
      status: "finalized",
      clientReviewReadyAt: now,
      clientReadyMessage,
      ...(resetAfterChangesRequested
        ? {
            clientApprovalStatus: "pending" as const,
            changesRequestedAt: undefined,
            clientApprovalNote: undefined,
          }
        : {}),
      updatedAt: now,
    });
    if (resetAfterChangesRequested) {
      await recordInvoiceStatusTransition(ctx, args.id, fromApprovalStatus, "pending", { at: now });
      await syncLinkedEventStatusFromInvoice(ctx, args.id, "pending");
    }

    const updatedInvoice = await ctx.db.get(args.id);
    if (updatedInvoice?.sourceEventRequestId) {
      await syncBookingRequestStatusFromInvoice(ctx, updatedInvoice, { at: now });
      const request = await ctx.db.get(updatedInvoice.sourceEventRequestId);
      if (request) {
        await scheduleBookingQuoteReadyEmail(ctx, {
          request,
          invoice: {
            _id: updatedInvoice._id,
            invoiceNumber: updatedInvoice.invoiceNumber,
            totalUsd: updatedInvoice.totalUsd,
            billingFinalizedAt: updatedInvoice.billingFinalizedAt,
            paymentOpenedEarlyAt: updatedInvoice.paymentOpenedEarlyAt,
            managerName: updatedInvoice.managerName,
            managerEmail: updatedInvoice.managerEmail,
            clientReviewReadyAt: now,
            clientReadyMessage,
          },
        });
      }
    }

    return null;
    });
  },
});

export const withdrawFromClientReview = mutation({
  args: { id: v.id("invoices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await withReportableErrors("invoices.withdrawFromClientReview", async () => {
    const invoice = await ctx.db.get(args.id);
    if (!invoice) appError("INVOICE_NOT_FOUND", "Invoice not found.");
    if (!invoice.sourceEventRequestId) {
      appError(
        "QUOTE_NOT_BOOKING_REQUEST",
        "Only booking-request quotes use the request portal.",
      );
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "draft",
      clientReviewReadyAt: undefined,
      updatedAt: now,
    });
    const withdrawn = await ctx.db.get(args.id);
    if (withdrawn) {
      await syncBookingRequestStatusFromInvoice(ctx, withdrawn, { at: now });
    }
    return null;
    });
  },
});

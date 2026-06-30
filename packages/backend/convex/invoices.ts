import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isAdmin, requireAdmin, requireArborInternalContext, requireAuth } from "./lib/auth";
import { syncLinkedEventStatusFromInvoice } from "./lib/eventStatus";
import { listEventsByInvoiceId } from "./lib/invoiceEvents";
import {
  approveInvoiceQuote,
  loadPublicQuoteView,
  requestInvoiceQuoteChanges,
  updateInvoicePaymentContacts,
} from "./lib/publicQuoteView";
import { allocateInvoiceNumber } from "./lib/publicReferenceIds";
import { scheduleBookingQuoteReadyEmail } from "./email/bookingRequestEmails";
import {
  markPayingPartyNotified,
  schedulePayingPartyAddedEmail,
} from "./email/payingPartyEmails";

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

async function computeLineAmount(
  ctx: MutationCtx,
  line: LineInput,
  equipmentPricingMode: "subsidized" | "nonSubsidized",
  crewRateMode: "normal" | "lead" | "custom" | "ot",
  crewRates: { normal: number; lead: number; ot: number },
) {
  if (line.quantity < 0) throw new Error("Line quantity cannot be negative.");
  let rate = line.rateUsd;

  if (line.section === "equipment_package" && line.packageId) {
    const pkg = await ctx.db.get(line.packageId);
    if (!pkg) throw new Error("Package line references a missing package.");
    rate =
      equipmentPricingMode === "subsidized"
        ? (pkg.subsidizedPackagePriceUsd ?? pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100)
        : (pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100);
  }

  if (line.section === "equipment_type" && line.typeId) {
    const type = await ctx.db.get(line.typeId);
    if (!type) throw new Error("Type line references a missing type.");
    rate =
      equipmentPricingMode === "subsidized"
        ? (type.subsidizedRentalPriceUsd ?? type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0)
        : (type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0);
  }

  if (line.section === "crew") {
    if (crewRateMode === "custom") {
      rate = line.rateUsd;
    } else if (crewRateMode === "lead" || crewRateMode === "ot") {
      rate = crewRates.lead;
    } else {
      rate = crewRates.normal;
    }
  }

  const amount = Number((Math.max(0, line.quantity) * Math.max(0, rate)).toFixed(2));
  return { rate, amount };
}

async function computeTotals(
  ctx: MutationCtx,
  lineItems: LineInput[],
  equipmentPricingMode: "subsidized" | "nonSubsidized",
  crewRateMode: "normal" | "lead" | "custom" | "ot",
  discountType: "amount" | "percent",
  discountValue: number,
) {
  const settings = await ctx.db.query("invoiceSettings").withIndex("by_key", (q) => q.eq("key", "default")).unique();
  const crewRates = {
    normal: settings?.crewNormalRateUsd ?? 0,
    lead: settings?.crewLeadRateUsd ?? settings?.crewOtRateUsd ?? settings?.crewNormalRateUsd ?? 0,
    ot: settings?.crewOtRateUsd ?? settings?.crewNormalRateUsd ?? 0,
  };

  let equipmentSubtotalUsd = 0;
  let externalRentalsSubtotalUsd = 0;
  let artistsSubtotalUsd = 0;
  let crewSubtotalUsd = 0;
  let feesSubtotalUsd = 0;

  const normalized: Array<LineInput & { rateUsd: number; amountUsd: number }> = [];
  for (const line of lineItems) {
    const { rate, amount } = await computeLineAmount(
      ctx,
      line,
      equipmentPricingMode,
      crewRateMode,
      crewRates,
    );
    normalized.push({ ...line, rateUsd: rate, amountUsd: amount });
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

async function replaceLineItems(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  rows: Array<LineInput & { rateUsd: number; amountUsd: number }>,
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
      feeDefinitionId: row.feeDefinitionId,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export const listManagers = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await requireAuth(ctx);
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
    const showRates = isAdmin(currentUser);
    const rateByUserId = showRates
      ? new Map(
          (await ctx.db.query("userCompensationRates").withIndex("by_updatedAt").take(1000)).map(
            (rate) => [rate.userId, rate.hourlyRateUsd],
          ),
        )
      : null;
    return users
      .map((user) => ({
        id: user.id ?? user._id ?? "",
        name: user.name ?? user.email ?? "Unknown user",
        email: user.email,
        role: user.role ?? undefined,
        image: user.image ?? undefined,
        hourlyRateUsd: rateByUserId?.get(user.id ?? user._id ?? "") ?? undefined,
      }))
      .filter((u) => Boolean(u.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listInvoiceManagersForAdmin = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      email: v.optional(v.string()),
      role: v.optional(v.string()),
      title: v.string(),
      phone: v.string(),
      active: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
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
    }>;
    const profiles = await ctx.db.query("userAdminProfiles").withIndex("by_active").take(2000);
    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
    return users
      .map((user) => {
        const id = user.id ?? user._id ?? "";
        const profile = profileByUserId.get(id);
        return {
          id,
          name: user.name ?? user.email ?? "Unknown user",
          email: user.email,
          role: user.role ?? undefined,
          title: profile?.title ?? "",
          phone: profile?.phone ?? "",
          active: profile?.active ?? true,
        };
      })
      .filter((user) => Boolean(user.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const list = query({
  args: { status: v.optional(v.union(v.literal("draft"), v.literal("finalized"), v.literal("void"))) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const rows = args.status
      ? await ctx.db.query("invoices").withIndex("by_status", (q) => q.eq("status", args.status!)).take(200)
      : await ctx.db.query("invoices").take(200);
    return rows.sort((a, b) => b.createdAt - a.createdAt);
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
    return { invoice, lineItems };
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
      publicApprovalTokenExpiresAt: undefined,
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
    const token = await generateUniquePublicApprovalToken(ctx);
    await ctx.db.patch(args.id, {
      publicApprovalToken: token,
      publicApprovalTokenExpiresAt: undefined,
      updatedAt: Date.now(),
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
      lineItems.map((line) => ({
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
      })),
      invoice.equipmentPricingMode,
      invoice.crewRateMode,
      invoice.discountType,
      invoice.discountValue,
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

export const markReadyForClientReview = mutation({
  args: { id: v.id("invoices") },
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
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "finalized",
      clientReviewReadyAt: now,
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

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { allocateInvoiceNumber } from "./publicReferenceIds";

type GroupType = "vso" | "house" | "department" | "individual";

function trimOptional(raw: string | undefined) {
  const out = raw?.trim();
  return out ? out : undefined;
}

export function mapSponsorTypeToGroupType(sponsorType: string): GroupType {
  const lower = sponsorType.toLowerCase();
  if (lower.includes("department")) return "department";
  if (lower.includes("house") || lower.includes("greek")) return "house";
  if (lower.includes("individual") || lower.includes("affiliate")) return "individual";
  return "vso";
}

export async function resolveClientGroupType(
  ctx: MutationCtx,
  request: Pick<Doc<"eventRequests">, "invoiceGroupId" | "sponsorType">,
): Promise<GroupType> {
  if (request.invoiceGroupId) {
    const group = await ctx.db.get(request.invoiceGroupId);
    if (group?.type) return group.type;
  }
  return mapSponsorTypeToGroupType(request.sponsorType);
}

export async function resolveClientGroupName(
  ctx: MutationCtx,
  request: Pick<Doc<"eventRequests">, "invoiceGroupId" | "organization" | "sponsorType">,
): Promise<string | undefined> {
  if (request.organization?.trim()) return request.organization.trim();
  if (request.invoiceGroupId) {
    const group = await ctx.db.get(request.invoiceGroupId);
    if (group?.name?.trim()) return group.name.trim();
  }
  return request.sponsorType.trim() || undefined;
}

export async function resolveEquipmentPricingMode(
  ctx: MutationCtx,
  request: Pick<Doc<"eventRequests">, "invoiceGroupId">,
): Promise<"subsidized" | "nonSubsidized"> {
  if (request.invoiceGroupId) {
    const group = await ctx.db.get(request.invoiceGroupId);
    if (group?.equipmentPricingMode) return group.equipmentPricingMode;
  }
  return "subsidized";
}

function pacificIssueDate(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export async function createDraftInvoiceFromBookingRequest(
  ctx: MutationCtx,
  args: {
    request: Doc<"eventRequests">;
    managerUserId: string;
    managerName: string;
    managerEmail?: string;
  },
): Promise<{ invoiceId: Id<"invoices"> }> {
  const { request } = args;
  const clientGroupType = await resolveClientGroupType(ctx, request);
  const clientGroupName = await resolveClientGroupName(ctx, request);
  const equipmentPricingMode = await resolveEquipmentPricingMode(ctx, request);
  const now = Date.now();

  const invoiceId = await ctx.db.insert("invoices", {
    invoiceNumber: await allocateInvoiceNumber(ctx),
    status: "draft",
    issueDate: pacificIssueDate(now),
    dueDate: undefined,
    managerUserId: args.managerUserId,
    managerName: args.managerName.trim(),
    managerEmail: trimOptional(args.managerEmail),
    groupId: request.invoiceGroupId,
    contactId: request.invoiceContactId,
    clientGroupName,
    clientGroupType,
    clientContactName: `${request.firstName} ${request.lastName}`.trim(),
    clientEmail: request.email,
    clientPhone: request.phone,
    clientAddressLine1: undefined,
    clientAddressLine2: undefined,
    clientCity: undefined,
    clientState: undefined,
    clientPostalCode: undefined,
    equipmentPricingMode,
    crewRateMode: "normal",
    discountType: "amount",
    discountValue: 0,
    discountAmountUsd: 0,
    discountWarning: undefined,
    equipmentSubtotalUsd: 0,
    externalRentalsSubtotalUsd: 0,
    artistsSubtotalUsd: 0,
    crewSubtotalUsd: 0,
    feesSubtotalUsd: 0,
    subtotalUsd: 0,
    totalUsd: 0,
    notes: undefined,
    termsIds: undefined,
    termsId: undefined,
    additionalTermsMarkdown: undefined,
    clientApprovalStatus: "pending",
    publicApprovalToken: undefined,
    publicApprovalTokenExpiresAt: undefined,
    sourceEventRequestId: request._id,
    clientReviewReadyAt: undefined,
    approvedAt: undefined,
    changesRequestedAt: undefined,
    clientApprovalNote: undefined,
    termsVersionAccepted: undefined,
    termsAcceptedAt: undefined,
    createdAt: now,
    updatedAt: now,
  });

  if (request.invoiceGroupId) {
    await ctx.db.patch(request.invoiceGroupId, { lastUsedAt: now, updatedAt: now });
  }
  if (request.invoiceContactId) {
    await ctx.db.patch(request.invoiceContactId, { lastUsedAt: now, updatedAt: now });
  }

  return { invoiceId };
}

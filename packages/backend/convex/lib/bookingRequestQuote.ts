import { addPacificCalendarDays, pacificDateKey } from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { findGroupByNameOrAlias, normalizeHostOrgName } from "./hostOrgIdentity";
import { upsertInvoicePerson } from "./invoicePeople";
import { allocateInvoiceNumber } from "./publicReferenceIds";

/** Quote due date is first event day + this many Pacific calendar days. */
export const INVOICE_DUE_DAYS_AFTER_FIRST_DAY = 30;

export function invoiceDueDateFromFirstDay(firstDayMs: number) {
  return pacificDateKey(addPacificCalendarDays(firstDayMs, INVOICE_DUE_DAYS_AFTER_FIRST_DAY));
}

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

export function mapGroupTypeToSponsor(type: GroupType): string {
  switch (type) {
    case "department":
      return "Stanford Department";
    case "house":
      return "Stanford House / Greek Life";
    case "individual":
      return "Individual Stanford Affiliate";
    case "vso":
      return "Large Voulunteer Student Organization";
  }
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

async function findActiveContactByEmailAndGroup(
  ctx: MutationCtx,
  email: string,
  groupId: Id<"invoiceGroups">,
) {
  const contacts = await ctx.db
    .query("invoiceContacts")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(50);
  return contacts.find((contact) => contact.active && contact.groupId === groupId) ?? null;
}

async function findActiveContactByEmail(ctx: MutationCtx, email: string) {
  const contacts = await ctx.db
    .query("invoiceContacts")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(50);
  return contacts.find((contact) => contact.active) ?? null;
}

async function ensureContactLinkedToGroup(
  ctx: MutationCtx,
  args: {
    groupId: Id<"invoiceGroups">;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    now: number;
  },
): Promise<Id<"invoiceContacts">> {
  const email = args.email.trim().toLowerCase();
  const firstName = args.firstName.trim();
  const lastName = args.lastName.trim();
  const phone = args.phone.trim();

  const personId = await upsertInvoicePerson(ctx, {
    email,
    firstName,
    lastName,
    phone,
    now: args.now,
  });

  const existingForGroup = await findActiveContactByEmailAndGroup(ctx, email, args.groupId);
  if (existingForGroup) {
    await ctx.db.patch(existingForGroup._id, {
      personId: personId ?? existingForGroup.personId,
      firstName,
      lastName,
      phone,
      updatedAt: args.now,
      lastUsedAt: args.now,
    });
    return existingForGroup._id;
  }

  const ungroupedByEmail = await findActiveContactByEmail(ctx, email);
  if (ungroupedByEmail && !ungroupedByEmail.groupId) {
    await ctx.db.patch(ungroupedByEmail._id, {
      groupId: args.groupId,
      personId: personId ?? ungroupedByEmail.personId,
      firstName,
      lastName,
      phone,
      updatedAt: args.now,
      lastUsedAt: args.now,
    });
    return ungroupedByEmail._id;
  }

  return await ctx.db.insert("invoiceContacts", {
    groupId: args.groupId,
    personId,
    firstName,
    lastName,
    email,
    phone,
    active: true,
    createdAt: args.now,
    updatedAt: args.now,
    lastUsedAt: args.now,
  });
}

async function ensureContactRecord(
  ctx: MutationCtx,
  args: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    now: number;
  },
): Promise<Id<"invoiceContacts">> {
  const email = args.email.trim().toLowerCase();
  const firstName = args.firstName.trim();
  const lastName = args.lastName.trim();
  const phone = args.phone.trim();

  const personId = await upsertInvoicePerson(ctx, {
    email,
    firstName,
    lastName,
    phone,
    now: args.now,
  });

  const existing = await findActiveContactByEmail(ctx, email);
  if (existing) {
    await ctx.db.patch(existing._id, {
      personId: personId ?? existing.personId,
      firstName,
      lastName,
      phone,
      updatedAt: args.now,
      lastUsedAt: args.now,
    });
    return existing._id;
  }

  return await ctx.db.insert("invoiceContacts", {
    personId,
    firstName,
    lastName,
    email,
    phone,
    active: true,
    createdAt: args.now,
    updatedAt: args.now,
    lastUsedAt: args.now,
  });
}

export async function provisionBillingProfileFromRequest(
  ctx: MutationCtx,
  args: {
    organization?: string;
    sponsorType: string;
    invoiceGroupId?: Id<"invoiceGroups">;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  },
): Promise<{ invoiceGroupId?: Id<"invoiceGroups">; invoiceContactId?: Id<"invoiceContacts"> }> {
  const now = Date.now();
  const email = args.email.trim().toLowerCase();
  let invoiceGroupId = args.invoiceGroupId;
  let invoiceContactId: Id<"invoiceContacts"> | undefined;
  const organization = trimOptional(args.organization);
  const groupType = mapSponsorTypeToGroupType(args.sponsorType);

  if (!invoiceGroupId && organization && groupType !== "individual") {
    const existingGroup = await findGroupByNameOrAlias(ctx, organization);
    if (existingGroup) {
      invoiceGroupId = existingGroup._id;
      await ctx.db.patch(existingGroup._id, { lastUsedAt: now, updatedAt: now });
    } else {
      invoiceGroupId = await ctx.db.insert("invoiceGroups", {
        name: organization,
        normalizedName: normalizeHostOrgName(organization),
        type: groupType,
        equipmentPricingMode: "subsidized",
        active: true,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
      });
    }
  }

  if (invoiceGroupId) {
    invoiceContactId = await ensureContactLinkedToGroup(ctx, {
      groupId: invoiceGroupId,
      email,
      firstName: args.firstName,
      lastName: args.lastName,
      phone: args.phone,
      now,
    });
  } else {
    invoiceContactId = await ensureContactRecord(ctx, {
      email,
      firstName: args.firstName,
      lastName: args.lastName,
      phone: args.phone,
      now,
    });
  }

  return { invoiceGroupId, invoiceContactId };
}

function firstDayMsFromRequest(request: Doc<"eventRequests">) {
  if (request.showSlots && request.showSlots.length > 0) {
    return Math.min(...request.showSlots.map((slot) => slot.startAtMs));
  }
  return request.eventStartAtMs;
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
    firstDayMs?: number;
  },
): Promise<{ invoiceId: Id<"invoices"> }> {
  const { request } = args;
  const clientGroupType = await resolveClientGroupType(ctx, request);
  const clientGroupName = await resolveClientGroupName(ctx, request);
  const equipmentPricingMode = await resolveEquipmentPricingMode(ctx, request);
  const now = Date.now();
  const firstDayMs = args.firstDayMs ?? firstDayMsFromRequest(request);

  const invoiceId = await ctx.db.insert("invoices", {
    invoiceNumber: await allocateInvoiceNumber(ctx),
    status: "draft",
    issueDate: pacificIssueDate(now),
    dueDate: firstDayMs != null ? invoiceDueDateFromFirstDay(firstDayMs) : undefined,
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

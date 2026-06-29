import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { getUserId, requireArborInternalContext, requireAuth } from "./lib/auth";
import { normalizeEventStatus } from "./lib/eventStatus";
import { createDraftInvoiceFromBookingRequest } from "./lib/bookingRequestQuote";
import {
  approveInvoiceQuote,
  loadPublicQuoteView,
  requestInvoiceQuoteChanges,
} from "./lib/publicQuoteView";
import { scheduleBookingRequestReceivedEmail } from "./email/bookingRequestEmails";
import { allocateRequestNumber } from "./lib/publicReferenceIds";

const EVENT_TIMEZONE = "America/Los_Angeles";

const eventRequestStatusValue = v.union(
  v.literal("submitted"),
  v.literal("in_review"),
  v.literal("converted"),
  v.literal("declined"),
);

const submitPublicArgs = {
  website: v.optional(v.string()),
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  phone: v.string(),
  organization: v.optional(v.string()),
  sponsorType: v.string(),
  invoiceContactId: v.optional(v.id("invoiceContacts")),
  invoiceGroupId: v.optional(v.id("invoiceGroups")),
  requestContext: v.optional(v.string()),
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
  eventName: v.string(),
  eventCategory: v.string(),
  crewOrRental: v.string(),
  servicesNeeded: v.array(v.string()),
  productionTier: v.optional(v.string()),
  eventDescription: v.optional(v.string()),
  expectedTurnout: v.number(),
  existingEquipment: v.optional(v.string()),
  lightingPreference: v.optional(v.string()),
  additionalNotes: v.optional(v.string()),
};

const publicRequestShape = {
  requestNumber: v.string(),
  status: eventRequestStatusValue,
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  organization: v.optional(v.string()),
  sponsorType: v.string(),
  venueName: v.optional(v.string()),
  venueAddress: v.optional(v.string()),
  eventDateText: v.string(),
  eventStartTimeText: v.string(),
  eventEndTimeText: v.string(),
  earliestSetupText: v.string(),
  eventName: v.optional(v.string()),
  eventCategory: v.string(),
  crewOrRental: v.optional(v.string()),
  servicesNeeded: v.array(v.string()),
  productionTier: v.optional(v.string()),
  expectedTurnout: v.number(),
  lightingPreference: v.optional(v.string()),
  submittedAt: v.number(),
  convertedEventId: v.optional(v.id("events")),
  linkedInvoiceId: v.optional(v.id("invoices")),
  quote: v.optional(
    v.object({
      invoiceNumber: v.string(),
      status: v.union(v.literal("draft"), v.literal("finalized"), v.literal("void")),
      clientApprovalStatus: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("changes_requested"),
      ),
      readyForClientReview: v.boolean(),
    }),
  ),
};

function trimOptional(value: string | undefined) {
  const out = value?.trim();
  return out ? out : undefined;
}

function isStanfordEmail(email: string) {
  return /^[^\s@]+@(?:stanford\.edu|alumni\.stanford\.edu)$/i.test(email.trim());
}

function makePublicToken() {
  return `req_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

function makeEventPublicToken() {
  return `evt_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

async function generateUniquePublicToken(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = makePublicToken();
    const existing = await ctx.db
      .query("eventRequests")
      .withIndex("by_publicToken", (q) => q.eq("publicToken", token))
      .unique();
    if (!existing) return token;
  }
  throw new Error("Unable to allocate tracking token.");
}

import { resolveContactNameParts } from "./lib/contactName";
  switch (type) {
    case "department":
      return "Stanford Department";
    case "house":
      return "Stanford House / Greek Life";
    case "individual":
      return "Individual Stanford Affiliate";
    case "vso":
    default:
      return "Large Voulunteer Student Organization";
  }
}

function mapServicesToTeams(
  crewOrRental: string | undefined,
  servicesNeeded: string[],
): Array<"Design" | "Marketing" | "Lighting" | "Sound" | "Operations"> {
  const teams = new Set<"Design" | "Marketing" | "Lighting" | "Sound" | "Operations">();
  if (crewOrRental === "Crewed") teams.add("Operations");
  for (const service of servicesNeeded) {
    if (service === "Sound") teams.add("Sound");
    if (service === "Lighting") teams.add("Lighting");
    if (service === "Staging") teams.add("Operations");
    if (service === "Collaboration") teams.add("Marketing");
    if (service === "Scheduling") teams.add("Operations");
  }
  return Array.from(teams);
}

function inferEventType(crewOrRental: string | undefined, servicesNeeded: string[]) {
  const hasSoundOrLighting = servicesNeeded.some((s) => s === "Sound" || s === "Lighting");
  if (crewOrRental === "Crewed" && hasSoundOrLighting) return "Rental with Crew";
  if (crewOrRental === "Crewed") return "Crewed Event";
  if (hasSoundOrLighting) return "Dry Rental";
  return "Services Only";
}

function defaultPlaceholderTimes() {
  const start = new Date();
  start.setDate(start.getDate() + 30);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start);
  end.setHours(22, 0, 0, 0);
  return { startAt: start.getTime(), endAt: end.getTime() };
}

export const lookupContactByEmail = query({
  args: { email: v.string() },
  returns: v.union(
    v.object({
      found: v.literal(true),
      firstName: v.string(),
      lastName: v.string(),
      phone: v.optional(v.string()),
      contactId: v.id("invoiceContacts"),
      groups: v.array(
        v.object({
          groupId: v.id("invoiceGroups"),
          groupName: v.string(),
          groupType: v.string(),
          sponsorType: v.string(),
        }),
      ),
    }),
    v.object({ found: v.literal(false) }),
  ),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!isStanfordEmail(email)) {
      return { found: false as const };
    }

    const contacts = await ctx.db
      .query("invoiceContacts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(20);
    const activeContacts = contacts.filter((row) => row.active);
    if (!activeContacts.length) {
      return { found: false as const };
    }

    const primary = activeContacts[0]!;
    const { firstName, lastName } = resolveContactNameParts(primary);
    const groups = (
      await Promise.all(
        activeContacts.map(async (contact) => {
          if (!contact.groupId) return null;
          const group = await ctx.db.get(contact.groupId);
          if (!group || !group.active) return null;
          return {
            groupId: group._id,
            groupName: group.name,
            groupType: group.type,
            sponsorType: mapGroupTypeToSponsor(group.type),
          };
        }),
      )
    ).filter((row): row is NonNullable<typeof row> => Boolean(row));

    const uniqueGroups = Array.from(new Map(groups.map((group) => [group.groupId, group])).values());

    return {
      found: true as const,
      firstName,
      lastName,
      phone: primary.phone,
      contactId: primary._id,
      groups: uniqueGroups,
    };
  },
});

export const getPublicRequestByToken = query({
  args: { token: v.string() },
  returns: v.union(v.object(publicRequestShape), v.null()),
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("eventRequests")
      .withIndex("by_publicToken", (q) => q.eq("publicToken", args.token))
      .unique();
    if (!request) return null;

    let quote: {
      invoiceNumber: string;
      status: "draft" | "finalized" | "void";
      clientApprovalStatus: "pending" | "approved" | "changes_requested";
      readyForClientReview: boolean;
    } | undefined;
    if (request.linkedInvoiceId) {
      const invoice = await ctx.db.get(request.linkedInvoiceId);
      if (invoice) {
        quote = {
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          clientApprovalStatus: invoice.clientApprovalStatus ?? "pending",
          readyForClientReview: Boolean(invoice.clientReviewReadyAt),
        };
      }
    }

    return {
      requestNumber: request.requestNumber ?? `LEGACY-${request._id}`,
      status: request.status,
      firstName: request.firstName,
      lastName: request.lastName,
      email: request.email,
      organization: request.organization,
      sponsorType: request.sponsorType,
      venueName: request.venueName,
      venueAddress: request.venueAddress,
      eventDateText: request.eventDateText,
      eventStartTimeText: request.eventStartTimeText,
      eventEndTimeText: request.eventEndTimeText,
      earliestSetupText: request.earliestSetupText,
      eventName: request.eventName,
      eventCategory: request.eventCategory,
      crewOrRental: request.crewOrRental,
      servicesNeeded: request.servicesNeeded,
      productionTier: request.productionTier,
      expectedTurnout: request.expectedTurnout,
      lightingPreference: request.lightingPreference,
      submittedAt: request.submittedAt,
      convertedEventId: request.convertedEventId,
      linkedInvoiceId: request.linkedInvoiceId,
      quote,
    };
  },
});

export const getPublicRequestQuoteByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("eventRequests")
      .withIndex("by_publicToken", (q) => q.eq("publicToken", args.token))
      .unique();
    if (!request?.linkedInvoiceId) return null;

    const invoice = await ctx.db.get(request.linkedInvoiceId);
    if (!invoice || invoice.status === "void" || !invoice.clientReviewReadyAt) return null;

    return await loadPublicQuoteView(ctx, invoice);
  },
});

export const approveQuoteByRequestToken = mutation({
  args: { token: v.string(), acceptTerms: v.boolean() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("eventRequests")
      .withIndex("by_publicToken", (q) => q.eq("publicToken", args.token))
      .unique();
    if (!request?.linkedInvoiceId) throw new Error("Quote not found.");

    const invoice = await ctx.db.get(request.linkedInvoiceId);
    if (!invoice || invoice.status === "void" || !invoice.clientReviewReadyAt) {
      throw new Error("Quote is not ready for review yet.");
    }
    await approveInvoiceQuote(ctx, invoice, args.acceptTerms);
    return { ok: true as const };
  },
});

export const requestQuoteChangesByRequestToken = mutation({
  args: { token: v.string(), note: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("eventRequests")
      .withIndex("by_publicToken", (q) => q.eq("publicToken", args.token))
      .unique();
    if (!request?.linkedInvoiceId) throw new Error("Quote not found.");

    const invoice = await ctx.db.get(request.linkedInvoiceId);
    if (!invoice || invoice.status === "void" || !invoice.clientReviewReadyAt) {
      throw new Error("Quote is not ready for review yet.");
    }
    await requestInvoiceQuoteChanges(ctx, invoice, args.note);
    return { ok: true as const };
  },
});

export const submitPublic = mutation({
  args: submitPublicArgs,
  returns: v.object({
    id: v.id("eventRequests"),
    publicToken: v.string(),
    requestNumber: v.string(),
  }),
  handler: async (ctx, args) => {
    if (args.website?.trim()) {
      throw new Error("Unable to submit request.");
    }
    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    const email = args.email.trim().toLowerCase();
    const phone = args.phone.trim();
    if (!isStanfordEmail(email)) {
      throw new Error("Please use a valid Stanford email address.");
    }
    if (!firstName || !lastName || !phone) {
      throw new Error("Contact information is required.");
    }
    if (!args.eventDateText.trim() || !args.eventStartTimeText.trim() || !args.eventEndTimeText.trim()) {
      throw new Error("Event timing is required.");
    }
    if (!args.earliestSetupText.trim() && !args.flexibleSetupTime) {
      throw new Error("Earliest setup availability is required.");
    }
    if (!args.eventCategory.trim()) {
      throw new Error("Event type is required.");
    }
    const eventName = args.eventName.trim();
    if (!eventName) {
      throw new Error("Event name is required.");
    }
    if (!args.crewOrRental.trim()) {
      throw new Error("Please select crewed or rental.");
    }
    const hasLightingService = args.servicesNeeded.includes("Lighting");
    if (hasLightingService && !args.lightingPreference?.trim()) {
      throw new Error("Lighting preference is required when lighting is selected.");
    }
    if (!Number.isFinite(args.expectedTurnout) || args.expectedTurnout <= 0) {
      throw new Error("Expected turnout must be a positive number.");
    }
    if (args.expectedTurnout >= 200) {
      // Major events are allowed but flagged in notes for staff follow-up.
    }

    const now = Date.now();
    const requestNumber = await allocateRequestNumber(ctx);
    const publicToken = await generateUniquePublicToken(ctx);

    const id = await ctx.db.insert("eventRequests", {
      status: "submitted",
      requestNumber,
      publicToken,
      firstName,
      lastName,
      email,
      phone,
      organization: trimOptional(args.organization),
      sponsorType: args.sponsorType.trim(),
      invoiceContactId: args.invoiceContactId,
      invoiceGroupId: args.invoiceGroupId,
      requestContext: trimOptional(args.requestContext),
      venueName: trimOptional(args.venueName),
      venueAddress: trimOptional(args.venueAddress),
      eventDateText: args.eventDateText.trim(),
      eventStartTimeText: args.eventStartTimeText.trim(),
      eventEndTimeText: args.eventEndTimeText.trim(),
      earliestSetupText: args.earliestSetupText.trim(),
      eventStartAtMs: args.eventStartAtMs,
      eventEndAtMs: args.eventEndAtMs,
      setupAtMs: args.setupAtMs,
      flexibleSetupTime: args.flexibleSetupTime,
      eventName,
      eventCategory: args.eventCategory.trim(),
      crewOrRental: args.crewOrRental.trim(),
      servicesNeeded: args.servicesNeeded,
      productionTier: trimOptional(args.productionTier),
      eventDescription: trimOptional(args.eventDescription),
      expectedTurnout: args.expectedTurnout,
      existingEquipment: trimOptional(args.existingEquipment),
      lightingPreference: trimOptional(args.lightingPreference),
      additionalNotes: trimOptional(args.additionalNotes),
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const inserted = await ctx.db.get(id);
    if (inserted) {
      await scheduleBookingRequestReceivedEmail(ctx, inserted);
    }

    return { id, publicToken, requestNumber };
  },
});

export const list = query({
  args: {
    status: v.optional(eventRequestStatusValue),
  },
  returns: v.array(
    v.object({
      _id: v.id("eventRequests"),
      _creationTime: v.number(),
      requestNumber: v.string(),
      status: eventRequestStatusValue,
      firstName: v.string(),
      lastName: v.string(),
      email: v.string(),
      phone: v.string(),
      organization: v.optional(v.string()),
      sponsorType: v.string(),
      venueName: v.optional(v.string()),
      eventDateText: v.string(),
      eventName: v.optional(v.string()),
      expectedTurnout: v.number(),
      eventCategory: v.string(),
      submittedAt: v.number(),
      convertedEventId: v.optional(v.id("events")),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const rows = args.status
      ? await ctx.db
          .query("eventRequests")
          .withIndex("by_status_and_submittedAt", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(100)
      : await ctx.db.query("eventRequests").order("desc").take(100);
    return rows.map((row) => ({
      _id: row._id,
      _creationTime: row._creationTime,
      requestNumber: row.requestNumber ?? `LEGACY-${row._id}`,
      status: row.status,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      organization: row.organization,
      sponsorType: row.sponsorType,
      venueName: row.venueName,
      eventDateText: row.eventDateText,
      eventName: row.eventName,
      expectedTurnout: row.expectedTurnout,
      eventCategory: row.eventCategory,
      submittedAt: row.submittedAt,
      convertedEventId: row.convertedEventId,
    }));
  },
});

export const get = query({
  args: { id: v.id("eventRequests") },
  returns: v.union(
    v.object({
      _id: v.id("eventRequests"),
      _creationTime: v.number(),
      requestNumber: v.string(),
      publicToken: v.string(),
      status: eventRequestStatusValue,
      firstName: v.string(),
      lastName: v.string(),
      email: v.string(),
      phone: v.string(),
      organization: v.optional(v.string()),
      sponsorType: v.string(),
      invoiceContactId: v.optional(v.id("invoiceContacts")),
      invoiceGroupId: v.optional(v.id("invoiceGroups")),
      requestContext: v.optional(v.string()),
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
      linkedInvoiceId: v.optional(v.id("invoices")),
      reviewedByUserId: v.optional(v.string()),
      staffNotes: v.optional(v.string()),
      submittedAt: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const row = await ctx.db.get(args.id);
    if (!row) return null;
    return {
      ...row,
      requestNumber: row.requestNumber ?? `LEGACY-${row._id}`,
      publicToken: row.publicToken ?? "",
    };
  },
});

export const getByLinkedInvoiceId = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.union(
    v.object({
      _id: v.id("eventRequests"),
      requestNumber: v.string(),
      publicToken: v.string(),
      status: eventRequestStatusValue,
      firstName: v.string(),
      lastName: v.string(),
      email: v.string(),
      phone: v.string(),
      organization: v.optional(v.string()),
      sponsorType: v.string(),
      venueName: v.optional(v.string()),
      venueAddress: v.optional(v.string()),
      eventDateText: v.string(),
      eventStartTimeText: v.string(),
      eventEndTimeText: v.string(),
      earliestSetupText: v.string(),
      eventName: v.optional(v.string()),
      flexibleSetupTime: v.optional(v.boolean()),
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
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const row = await ctx.db
      .query("eventRequests")
      .withIndex("by_linkedInvoiceId", (q) => q.eq("linkedInvoiceId", args.invoiceId))
      .unique();
    if (!row) return null;
    return {
      _id: row._id,
      requestNumber: row.requestNumber ?? `LEGACY-${row._id}`,
      publicToken: row.publicToken ?? "",
      status: row.status,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      organization: row.organization,
      sponsorType: row.sponsorType,
      venueName: row.venueName,
      venueAddress: row.venueAddress,
      eventDateText: row.eventDateText,
      eventStartTimeText: row.eventStartTimeText,
      eventEndTimeText: row.eventEndTimeText,
      earliestSetupText: row.earliestSetupText,
      eventName: row.eventName,
      flexibleSetupTime: row.flexibleSetupTime,
      eventCategory: row.eventCategory,
      crewOrRental: row.crewOrRental,
      servicesNeeded: row.servicesNeeded,
      productionTier: row.productionTier,
      eventDescription: row.eventDescription,
      expectedTurnout: row.expectedTurnout,
      existingEquipment: row.existingEquipment,
      lightingPreference: row.lightingPreference,
      additionalNotes: row.additionalNotes,
      convertedEventId: row.convertedEventId,
    };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("eventRequests"),
    status: v.union(v.literal("in_review"), v.literal("declined")),
    staffNotes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Request not found.");
    if (existing.status === "converted") {
      throw new Error("Converted requests cannot be updated.");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.status,
      staffNotes: trimOptional(args.staffNotes),
      reviewedByUserId: getUserId(user),
      updatedAt: now,
    });
    return null;
  },
});

export const convertToEvent = mutation({
  args: { id: v.id("eventRequests") },
  returns: v.object({
    eventId: v.id("events"),
    invoiceId: v.id("invoices"),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Request not found.");

    if (request.convertedEventId && request.linkedInvoiceId) {
      return {
        eventId: request.convertedEventId,
        invoiceId: request.linkedInvoiceId,
      };
    }

    const managerUserId = getUserId(user);
    const managerName = user.name?.trim() || user.email || "Arbor Live";
    const { invoiceId } = await createDraftInvoiceFromBookingRequest(ctx, {
      request,
      managerUserId,
      managerName,
      managerEmail: user.email,
    });

    const startAt = request.eventStartAtMs ?? defaultPlaceholderTimes().startAt;
    const endAt = request.eventEndAtMs ?? defaultPlaceholderTimes().endAt;
    const teamsInterested = mapServicesToTeams(request.crewOrRental, request.servicesNeeded);
    const eventType = inferEventType(request.crewOrRental, request.servicesNeeded);
    const title =
      request.eventName?.trim() ||
      request.venueName?.trim() ||
      `${request.eventCategory} — ${request.firstName} ${request.lastName}`;
    const host = request.organization?.trim() || request.sponsorType;
    const now = Date.now();

    if (request.convertedEventId) {
      await ctx.db.patch(request.convertedEventId, {
        invoiceId,
        updatedAt: now,
      });
      await ctx.db.patch(args.id, {
        status: "converted",
        linkedInvoiceId: invoiceId,
        reviewedByUserId: managerUserId,
        updatedAt: now,
      });
      return {
        eventId: request.convertedEventId,
        invoiceId,
      };
    }

    const eventId = await ctx.db.insert("events", {
      title,
      status: normalizeEventStatus("tentative"),
      visibility: "internal",
      publicToken: makeEventPublicToken(),
      startAt,
      endAt,
      timezone: EVENT_TIMEZONE,
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      venueName: request.venueName,
      eventType: eventType as
        | "Crewed Event"
        | "Rental with Crew"
        | "Dry Hire"
        | "Dry Rental"
        | "Services Only"
        | undefined,
      teamsInterested: teamsInterested.length > 0 ? teamsInterested : undefined,
      category: request.eventCategory,
      host,
      expectedTurnout: request.expectedTurnout,
      invoiceId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.id, {
      status: "converted",
      convertedEventId: eventId,
      linkedInvoiceId: invoiceId,
      reviewedByUserId: managerUserId,
      updatedAt: now,
    });

    return { eventId, invoiceId };
  },
});

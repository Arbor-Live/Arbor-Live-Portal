import { v } from "convex/values";
import { pacificDateAndTimeToMs } from "@arbor/format";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getUserId, requireArborInternalContext, requireAuth, findAuthUsersByIds } from "./lib/auth";
import { normalizeEventStatus } from "./lib/eventStatus";
import { createDraftInvoiceFromBookingRequest, mapGroupTypeToSponsor, mapSponsorTypeToGroupType, provisionBillingProfileFromRequest } from "./lib/bookingRequestQuote";
import { searchHostOrganizations } from "./lib/hostOrgIdentity";
import { resolveHostLink } from "./lib/hostOrgs";
import {
  approveInvoiceQuote,
  incrementPublicQuoteView,
  loadPublicQuoteView,
  requestInvoiceQuoteChanges,
  updateInvoicePaymentContacts,
} from "./lib/publicQuoteView";
import { scheduleBookingRequestReceivedEmail } from "./email/bookingRequestEmails";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";
import { allocateRequestNumber } from "./lib/publicReferenceIds";
import { resolveContactNameParts } from "./lib/contactName";
import {
  buildPublicBookingDayLoad,
  EVENT_TIMEZONE,
  formatPacificShortDate,
  groupShowSlotsByDay,
  listEventsLinkedToRequest,
  primaryConvertedEventId,
  toPacificDateKey,
  type DayEventPlan,
} from "./lib/bookingDayLoad";
import { resolveVenueLink } from "./lib/venues";
import {
  bookingDeclineReasonCodeValue,
  recordEventRequestStatusTransition,
} from "./lib/statusTransitions";

const BOOKING_REQUEST_SETTINGS_KEY = "default";

function authUserDisplayName(
  userByKey: Map<string, { name?: string | null; email?: string | null }>,
  userId: string | undefined,
) {
  if (!userId) return null;
  const user = userByKey.get(userId);
  if (!user) return null;
  return user.name?.trim() || user.email?.trim() || null;
}

async function getOrCreateBookingRequestSettings(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("bookingRequestSettings")
    .withIndex("by_key", (q) => q.eq("key", BOOKING_REQUEST_SETTINGS_KEY))
    .unique();
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert("bookingRequestSettings", {
    key: BOOKING_REQUEST_SETTINGS_KEY,
    roundRobinUserIds: [],
    roundRobinCursorIndex: 0,
    updatedAt: now,
  });
  return (await ctx.db.get(id))!;
}

async function assignNextRoundRobinUser(ctx: MutationCtx): Promise<string | undefined> {
  const settings = await getOrCreateBookingRequestSettings(ctx);
  const pool = settings.roundRobinUserIds.filter(Boolean);
  if (pool.length === 0) return undefined;
  const index = ((settings.roundRobinCursorIndex % pool.length) + pool.length) % pool.length;
  const assigneeUserId = pool[index]!;
  await ctx.db.patch(settings._id, {
    roundRobinCursorIndex: (index + 1) % pool.length,
    updatedAt: Date.now(),
  });
  return assigneeUserId;
}

const eventRequestStatusValue = v.union(
  v.literal("submitted"),
  v.literal("in_review"),
  v.literal("converted"),
  v.literal("declined"),
);

const showSlotValue = v.object({
  date: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  startAtMs: v.number(),
  endAtMs: v.number(),
  endsNextDay: v.boolean(),
});

const dayLoadEntryValue = v.object({
  count: v.number(),
  level: v.union(v.literal("free"), v.literal("busy"), v.literal("unavailable")),
});

const convertedEventSummaryValue = v.object({
  id: v.id("events"),
  title: v.string(),
  startAt: v.number(),
});

const submitPublicArgs = {
  website: v.optional(v.string()),
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  phone: v.string(),
  organization: v.optional(v.string()),
  sponsorType: v.string(),
  // NOTE: no invoiceContactId here — anonymous callers must never pick the
  // contact record; it is resolved server-side by email.
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
  showSlots: v.optional(v.array(showSlotValue)),
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
  eventScheduleText: v.optional(v.string()),
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
  const normalized = (crewOrRental ?? "").trim().toLowerCase();
  const isCrewed = normalized === "crewed" || normalized.startsWith("crewed ");
  if (isCrewed) return "Crewed Event";
  const hasSoundOrLighting = servicesNeeded.some((s) => s === "Sound" || s === "Lighting");
  if (hasSoundOrLighting) return "Dry Rental";
  return "Services Only";
}

function defaultPlaceholderTimes() {
  const dateKey = toPacificDateKey(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const startAt = pacificDateAndTimeToMs(dateKey, "18:00") ?? Date.now() + 30 * 24 * 60 * 60 * 1000;
  const endAt = pacificDateAndTimeToMs(dateKey, "22:00") ?? startAt + 4 * 60 * 60 * 1000;
  return { startAt, endAt };
}

function buildDayEventPlans(
  request: {
    showSlots?: Array<{ date: string; startAtMs: number; endAtMs: number }>;
    eventStartAtMs?: number;
    eventEndAtMs?: number;
  },
): DayEventPlan[] {
  if (request.showSlots?.length) {
    return groupShowSlotsByDay(request.showSlots);
  }
  const placeholder = defaultPlaceholderTimes();
  const startAt = request.eventStartAtMs ?? placeholder.startAt;
  const endAt = request.eventEndAtMs ?? placeholder.endAt;
  return [{ date: toPacificDateKey(startAt), startAt, endAt }];
}

function titleForDayEvent(baseTitle: string, dateKey: string, multiDay: boolean) {
  if (!multiDay) return baseTitle;
  return `${baseTitle} — ${formatPacificShortDate(dateKey)}`;
}

async function seedScheduleBlocksForConvertedEvent(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    eventType: string;
    dayPlan: DayEventPlan;
    setupAtMs?: number;
    now: number;
  },
) {
  const { eventId, eventType, dayPlan, setupAtMs, now } = args;
  const showStart = dayPlan.startAt;
  const showEnd = dayPlan.endAt;
  const blocks: Array<{
    blockType: "setup" | "show" | "strike" | "custom";
    label: string;
    dayIndex: number;
    startsAt: number;
    endsAt: number;
  }> = [];

  if (eventType === "Crewed Event") {
    const setupStart = setupAtMs && setupAtMs < showStart ? setupAtMs : showStart - 2 * 60 * 60 * 1000;
    blocks.push({
      blockType: "setup",
      label: "Setup",
      dayIndex: 0,
      startsAt: setupStart,
      endsAt: showStart,
    });
    blocks.push({
      blockType: "show",
      label: "Show",
      dayIndex: 0,
      startsAt: showStart,
      endsAt: showEnd,
    });
    const strikeEnd = showEnd + 60 * 60 * 1000;
    blocks.push({
      blockType: "strike",
      label: "Strike",
      dayIndex: toPacificDateKey(showEnd) === toPacificDateKey(showStart) ? 0 : 1,
      startsAt: showEnd,
      endsAt: strikeEnd,
    });
  } else if (eventType === "Dry Rental" || eventType === "Rental with Crew") {
    const deliveryStart = setupAtMs && setupAtMs < showStart ? setupAtMs : showStart - 60 * 60 * 1000;
    blocks.push({
      blockType: eventType === "Dry Rental" ? "custom" : "setup",
      label: eventType === "Dry Rental" ? "Delivery" : "Setup",
      dayIndex: 0,
      startsAt: deliveryStart,
      endsAt: showStart,
    });
    if (eventType === "Rental with Crew") {
      blocks.push({
        blockType: "strike",
        label: "Strike",
        dayIndex: 0,
        startsAt: showEnd,
        endsAt: showEnd + 60 * 60 * 1000,
      });
    } else {
      blocks.push({
        blockType: "custom",
        label: "Return",
        dayIndex: 0,
        startsAt: showEnd,
        endsAt: showEnd + 60 * 60 * 1000,
      });
    }
  }

  for (const block of blocks) {
    if (block.endsAt <= block.startsAt) continue;
    await ctx.db.insert("eventScheduleBlocks", {
      eventId,
      blockType: block.blockType,
      label: block.label,
      dayIndex: block.dayIndex,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// Public (unauthenticated) lookup used by the booking wizard. Deliberately
// returns no PII beyond first name + group names: last name, phone, and
// contact IDs must never be exposed here.
export const lookupContactByEmail = query({
  args: { email: v.string() },
  returns: v.union(
    v.object({
      found: v.literal(true),
      firstName: v.string(),
      lastName: v.string(),
      phone: v.string(),
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

    const person = await ctx.db
      .query("invoicePeople")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    const contacts = person
      ? await ctx.db
          .query("invoiceContacts")
          .withIndex("by_personId", (q) => q.eq("personId", person._id))
          .take(50)
      : await ctx.db
          .query("invoiceContacts")
          .withIndex("by_email", (q) => q.eq("email", email))
          .take(20);

    const activeContacts = contacts.filter((row) => row.active);
    if (!activeContacts.length && !person) {
      return { found: false as const };
    }
    if (!activeContacts.length && person) {
      return {
        found: true as const,
        firstName: person.firstName?.trim() ?? "",
        lastName: person.lastName?.trim() ?? "",
        phone: person.phone?.trim() ?? "",
        groups: [],
      };
    }

    // Prefer the contact record with the most complete details for autofill.
    const primary = [...activeContacts].sort((a, b) => {
      const score = (row: (typeof activeContacts)[number]) => {
        const { firstName, lastName } = resolveContactNameParts(row);
        return (
          (firstName ? 1 : 0) + (lastName ? 1 : 0) + (row.phone?.trim() ? 1 : 0)
        );
      };
      return score(b) - score(a);
    })[0]!;
    const fromPerson = person
      ? {
          firstName: person.firstName?.trim() ?? "",
          lastName: person.lastName?.trim() ?? "",
          phone: person.phone?.trim() ?? "",
        }
      : null;
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
      firstName: fromPerson?.firstName || firstName,
      lastName: fromPerson?.lastName || lastName,
      phone: fromPerson?.phone || primary.phone?.trim() || "",
      groups: uniqueGroups,
    };
  },
});

export const searchHostOrganizationsPublic = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      groupId: v.id("invoiceGroups"),
      name: v.string(),
      type: v.string(),
      sponsorType: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const query = args.query.trim();
    if (query.length < 2) return [];
    const limit = Math.max(1, Math.min(args.limit ?? 12, 30));
    const groups = await searchHostOrganizations(ctx, query, limit);
    return groups.map((group) => ({
      groupId: group._id,
      name: group.name,
      type: group.type,
      sponsorType: mapGroupTypeToSponsor(group.type),
    }));
  },
});

export const getPublicBookingDayLoad = query({
  args: {
    rangeStart: v.string(),
    rangeEnd: v.string(),
  },
  returns: v.record(v.string(), dayLoadEntryValue),
  handler: async (ctx, args) => {
    return await buildPublicBookingDayLoad(ctx, args.rangeStart.trim(), args.rangeEnd.trim());
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
      eventScheduleText: request.eventScheduleText,
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

export const recordPublicQuoteViewByRequestToken = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `requestQuoteView:${args.token}`, { limit: 120, windowMs: HOUR_MS });
    const request = await ctx.db
      .query("eventRequests")
      .withIndex("by_publicToken", (q) => q.eq("publicToken", args.token))
      .unique();
    if (!request?.linkedInvoiceId) return null;
    const invoice = await ctx.db.get(request.linkedInvoiceId);
    if (!invoice || invoice.status === "void" || !invoice.clientReviewReadyAt) return null;
    await incrementPublicQuoteView(ctx, invoice);
    return null;
  },
});

export const approveQuoteByRequestToken = mutation({
  args: {
    token: v.string(),
    signedName: v.string(),
    clientIsPaymentSubmitter: v.boolean(),
    paymentSubmitterName: v.optional(v.string()),
    paymentSubmitterEmail: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `requestToken:${args.token}`, { limit: 30, windowMs: HOUR_MS });
    const request = await ctx.db
      .query("eventRequests")
      .withIndex("by_publicToken", (q) => q.eq("publicToken", args.token))
      .unique();
    if (!request?.linkedInvoiceId) throw new Error("Quote not found.");

    const invoice = await ctx.db.get(request.linkedInvoiceId);
    if (!invoice || invoice.status === "void" || !invoice.clientReviewReadyAt) {
      throw new Error("Quote is not ready for review yet.");
    }
    await approveInvoiceQuote(ctx, invoice, args);
    return { ok: true as const };
  },
});

export const requestQuoteChangesByRequestToken = mutation({
  args: { token: v.string(), note: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `requestToken:${args.token}`, { limit: 30, windowMs: HOUR_MS });
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

export const updatePaymentContactsByRequestToken = mutation({
  args: {
    token: v.string(),
    clientIsPaymentSubmitter: v.optional(v.boolean()),
    paymentSubmitterName: v.optional(v.string()),
    paymentSubmitterEmail: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, `requestToken:${args.token}`, { limit: 30, windowMs: HOUR_MS });
    const request = await ctx.db
      .query("eventRequests")
      .withIndex("by_publicToken", (q) => q.eq("publicToken", args.token))
      .unique();
    if (!request?.linkedInvoiceId) throw new Error("Quote not found.");

    const invoice = await ctx.db.get(request.linkedInvoiceId);
    if (!invoice || invoice.status === "void" || !invoice.clientReviewReadyAt) {
      throw new Error("Quote is not ready for review yet.");
    }
    const { token: _token, ...contactArgs } = args;
    await updateInvoicePaymentContacts(ctx, invoice, contactArgs);
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
    if (
      args.eventStartAtMs !== undefined &&
      args.eventEndAtMs !== undefined &&
      args.eventEndAtMs <= args.eventStartAtMs
    ) {
      throw new Error("Event end time must be after start time.");
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

    const organization = trimOptional(args.organization);
    const groupType = mapSponsorTypeToGroupType(args.sponsorType);
    if (groupType !== "individual" && !args.invoiceGroupId && !organization) {
      throw new Error("Organization or group name is required for non-individual requests.");
    }

    // Throttle before the first billing-table write. Per-email caps a single
    // submitter; the global key is a backstop against a spray of addresses.
    await enforceRateLimit(ctx, `submitPublic:${email}`, { limit: 5, windowMs: HOUR_MS });
    await enforceRateLimit(ctx, "submitPublic:global", { limit: 60, windowMs: HOUR_MS });

    const billingProfile = await provisionBillingProfileFromRequest(ctx, {
      organization,
      sponsorType: args.sponsorType.trim(),
      invoiceGroupId: args.invoiceGroupId,
      firstName,
      lastName,
      email,
      phone,
    });

    const now = Date.now();
    const requestNumber = await allocateRequestNumber(ctx);
    const publicToken = await generateUniquePublicToken(ctx);

    // Public booking collects freeform venue text; staff links a real venue later.
    const venueLink = args.venueId
      ? await resolveVenueLink(ctx, args.venueId)
      : {
          venueId: undefined,
          venueName: trimOptional(args.venueName),
          venueAddress: trimOptional(args.venueAddress),
        };
    const id = await ctx.db.insert("eventRequests", {
      status: "submitted",
      requestNumber,
      publicToken,
      firstName,
      lastName,
      email,
      phone,
      organization,
      sponsorType: args.sponsorType.trim(),
      invoiceContactId: billingProfile.invoiceContactId,
      invoiceGroupId: billingProfile.invoiceGroupId,
      requestContext: trimOptional(args.requestContext),
      venueId: venueLink.venueId,
      venueName: venueLink.venueName,
      venueAddress: venueLink.venueAddress,
      eventDateText: args.eventDateText.trim(),
      eventStartTimeText: args.eventStartTimeText.trim(),
      eventEndTimeText: args.eventEndTimeText.trim(),
      earliestSetupText: args.earliestSetupText.trim(),
      eventStartAtMs: args.eventStartAtMs,
      eventEndAtMs: args.eventEndAtMs,
      setupAtMs: args.setupAtMs,
      flexibleSetupTime: args.flexibleSetupTime,
      endsNextDay: args.endsNextDay,
      additionalShowDates: args.additionalShowDates,
      eventScheduleText: trimOptional(args.eventScheduleText),
      showSlots: args.showSlots,
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
      assigneeUserId: await assignNextRoundRobinUser(ctx),
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
    includeTerminal: v.optional(v.boolean()),
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
      assigneeUserId: v.optional(v.string()),
      assigneeName: v.union(v.string(), v.null()),
      convertedEventId: v.optional(v.id("events")),
      convertedEventIds: v.optional(v.array(v.id("events"))),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const includeTerminal = args.includeTerminal === true;
    let rows;
    if (args.status) {
      rows = await ctx.db
        .query("eventRequests")
        .withIndex("by_status_and_submittedAt", (q) => q.eq("status", args.status!))
        .order("asc")
        .take(100);
    } else if (!includeTerminal) {
      const submitted = await ctx.db
        .query("eventRequests")
        .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "submitted"))
        .order("asc")
        .take(100);
      const inReview = await ctx.db
        .query("eventRequests")
        .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "in_review"))
        .order("asc")
        .take(100);
      rows = [...submitted, ...inReview]
        .sort((a, b) => a.submittedAt - b.submittedAt)
        .slice(0, 100);
    } else {
      rows = await ctx.db.query("eventRequests").order("asc").take(100);
      rows = [...rows].sort((a, b) => a.submittedAt - b.submittedAt);
    }
    const assigneeIds = rows.map((row) => row.assigneeUserId).filter(Boolean) as string[];
    const userByKey = await findAuthUsersByIds(ctx, assigneeIds);
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
      assigneeUserId: row.assigneeUserId,
      assigneeName: authUserDisplayName(userByKey, row.assigneeUserId),
      convertedEventId: row.convertedEventId,
      convertedEventIds: row.convertedEventIds,
    }));
  },
});

export const getBookingRequestSettings = query({
  args: {},
  returns: v.object({
    roundRobinUserIds: v.array(v.string()),
    roundRobinCursorIndex: v.number(),
  }),
  handler: async (ctx) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const row = await ctx.db
      .query("bookingRequestSettings")
      .withIndex("by_key", (q) => q.eq("key", BOOKING_REQUEST_SETTINGS_KEY))
      .unique();
    return {
      roundRobinUserIds: row?.roundRobinUserIds ?? [],
      roundRobinCursorIndex: row?.roundRobinCursorIndex ?? 0,
    };
  },
});

export const updateBookingRequestSettings = mutation({
  args: {
    roundRobinUserIds: v.array(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const settings = await getOrCreateBookingRequestSettings(ctx);
    const uniqueIds = [...new Set(args.roundRobinUserIds.map((id) => id.trim()).filter(Boolean))];
    const cursor =
      uniqueIds.length === 0
        ? 0
        : Math.min(settings.roundRobinCursorIndex, uniqueIds.length - 1);
    await ctx.db.patch(settings._id, {
      roundRobinUserIds: uniqueIds,
      roundRobinCursorIndex: cursor,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const setAssignee = mutation({
  args: {
    id: v.id("eventRequests"),
    assigneeUserId: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Request not found.");
    const assigneeUserId = args.assigneeUserId?.trim() || undefined;
    if (assigneeUserId) {
      const users = await findAuthUsersByIds(ctx, [assigneeUserId]);
      if (!users.has(assigneeUserId)) throw new Error("Assignee user not found.");
    }
    await ctx.db.patch(args.id, {
      assigneeUserId,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
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
      venueId: v.optional(v.id("venues")),
      venueName: v.optional(v.string()),
      venueAddress: v.optional(v.string()),
      eventDateText: v.string(),
      eventStartTimeText: v.string(),
      eventEndTimeText: v.string(),
      eventScheduleText: v.optional(v.string()),
      earliestSetupText: v.string(),
      eventStartAtMs: v.optional(v.number()),
      eventEndAtMs: v.optional(v.number()),
      setupAtMs: v.optional(v.number()),
      flexibleSetupTime: v.optional(v.boolean()),
      endsNextDay: v.optional(v.boolean()),
      additionalShowDates: v.optional(v.array(v.string())),
      showSlots: v.optional(v.array(showSlotValue)),
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
      convertedEvents: v.array(convertedEventSummaryValue),
      linkedInvoiceId: v.optional(v.id("invoices")),
      reviewedByUserId: v.optional(v.string()),
      staffNotes: v.optional(v.string()),
      reviewedAt: v.optional(v.number()),
      convertedAt: v.optional(v.number()),
      declinedAt: v.optional(v.number()),
      declineReasonCode: v.optional(bookingDeclineReasonCodeValue),
      declineReasonNote: v.optional(v.string()),
      assigneeUserId: v.optional(v.string()),
      assigneeName: v.union(v.string(), v.null()),
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
    const convertedEvents = (await listEventsLinkedToRequest(ctx, row)).map((event) => ({
      id: event._id,
      title: event.title,
      startAt: event.startAt,
    }));
    const userByKey = await findAuthUsersByIds(
      ctx,
      row.assigneeUserId ? [row.assigneeUserId] : [],
    );
    return {
      ...row,
      requestNumber: row.requestNumber ?? `LEGACY-${row._id}`,
      publicToken: row.publicToken ?? "",
      convertedEvents,
      assigneeName: authUserDisplayName(userByKey, row.assigneeUserId),
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
      eventScheduleText: v.optional(v.string()),
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
      eventScheduleText: row.eventScheduleText,
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
    declineReasonCode: v.optional(bookingDeclineReasonCodeValue),
    declineReasonNote: v.optional(v.string()),
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
    if (args.status === "declined" && !args.declineReasonCode) {
      throw new Error("Select a decline reason.");
    }
    const now = Date.now();
    const actorUserId = getUserId(user);
    const patch: {
      status: "in_review" | "declined";
      staffNotes?: string;
      reviewedByUserId: string;
      updatedAt: number;
      reviewedAt?: number;
      declinedAt?: number;
      declineReasonCode?: typeof args.declineReasonCode;
      declineReasonNote?: string;
    } = {
      status: args.status,
      staffNotes: trimOptional(args.staffNotes),
      reviewedByUserId: actorUserId,
      updatedAt: now,
    };
    if (args.status === "in_review") {
      patch.reviewedAt = existing.reviewedAt ?? now;
    }
    if (args.status === "declined") {
      patch.declinedAt = now;
      patch.declineReasonCode = args.declineReasonCode;
      patch.declineReasonNote = trimOptional(args.declineReasonNote);
    }
    await ctx.db.patch(args.id, patch);
    await recordEventRequestStatusTransition(ctx, args.id, existing.status, args.status, {
      actorUserId,
      at: now,
      reasonCode: args.declineReasonCode,
      reasonNote: trimOptional(args.declineReasonNote),
    });
    return null;
  },
});

export const convertToEvent = mutation({
  args: { id: v.id("eventRequests") },
  returns: v.object({
    eventId: v.id("events"),
    eventIds: v.array(v.id("events")),
    invoiceId: v.id("invoices"),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const request = await ctx.db.get(args.id);
    if (!request) throw new Error("Request not found.");

    const existingPrimaryEventId = primaryConvertedEventId(request);
    if (existingPrimaryEventId && request.linkedInvoiceId) {
      const existingEvents = await listEventsLinkedToRequest(ctx, request);
      const eventIds = existingEvents.map((event) => event._id);
      return {
        eventId: existingPrimaryEventId,
        eventIds: eventIds.length > 0 ? eventIds : [existingPrimaryEventId],
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

    const dayPlans = buildDayEventPlans(request);
    if (dayPlans.length === 0) {
      const placeholder = defaultPlaceholderTimes();
      const startAt = request.eventStartAtMs ?? placeholder.startAt;
      const endAt = request.eventEndAtMs ?? placeholder.endAt;
      dayPlans.push({ date: toPacificDateKey(startAt), startAt, endAt });
    }
    const teamsInterested = mapServicesToTeams(request.crewOrRental, request.servicesNeeded);
    const eventType = inferEventType(request.crewOrRental, request.servicesNeeded);
    const baseTitle =
      request.eventName?.trim() ||
      request.venueName?.trim() ||
      `${request.eventCategory} — ${request.firstName} ${request.lastName}`;
    const hostLink = await resolveHostLink(ctx, request.invoiceGroupId);
    const host =
      hostLink.host ??
      (request.organization?.trim() ? request.organization.trim() : request.sponsorType);
    const multiDay = dayPlans.length > 1;
    const now = Date.now();

    if (existingPrimaryEventId) {
      const existingEvents = await listEventsLinkedToRequest(ctx, request);
      for (const event of existingEvents) {
        await ctx.db.patch(event._id, {
          invoiceId,
          updatedAt: now,
        });
      }
      await ctx.db.patch(args.id, {
        status: "converted",
        linkedInvoiceId: invoiceId,
        convertedEventIds: existingEvents.map((event) => event._id),
        convertedEventId: existingEvents[0]?._id ?? existingPrimaryEventId,
        reviewedByUserId: managerUserId,
        updatedAt: now,
      });
      const eventIds = existingEvents.map((event) => event._id);
      return {
        eventId: eventIds[0] ?? existingPrimaryEventId,
        eventIds: eventIds.length > 0 ? eventIds : [existingPrimaryEventId],
        invoiceId,
      };
    }

    const eventIds: Id<"events">[] = [];
    for (const dayPlan of dayPlans) {
      const eventId = await ctx.db.insert("events", {
        title: titleForDayEvent(baseTitle, dayPlan.date, multiDay),
        status: normalizeEventStatus("tentative"),
        visibility: "public",
        publicToken: makeEventPublicToken(),
        startAt: dayPlan.startAt,
        endAt: dayPlan.endAt,
        timezone: EVENT_TIMEZONE,
        spansMultipleDays: false,
        setupOnly: false,
        strikeOnly: false,
        requiresShowWindow: true,
        venueId: request.venueId,
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
        hostGroupId: hostLink.hostGroupId,
        host,
        expectedTurnout: request.expectedTurnout,
        invoiceId,
        sourceEventRequestId: request._id,
        createdAt: now,
        updatedAt: now,
      });
      eventIds.push(eventId);
      await seedScheduleBlocksForConvertedEvent(ctx, {
        eventId,
        eventType,
        dayPlan,
        setupAtMs: request.setupAtMs,
        now,
      });
    }

    await ctx.db.patch(args.id, {
      status: "converted",
      convertedEventId: eventIds[0],
      convertedEventIds: eventIds,
      linkedInvoiceId: invoiceId,
      reviewedByUserId: managerUserId,
      reviewedAt: request.reviewedAt ?? now,
      convertedAt: now,
      updatedAt: now,
    });
    await recordEventRequestStatusTransition(ctx, args.id, request.status, "converted", {
      actorUserId: managerUserId,
      at: now,
    });

    return {
      eventId: eventIds[0]!,
      eventIds,
      invoiceId,
    };
  },
});

import { payPeriodForDate, addPacificCalendarDays, pacificDateAndTimeToMs, pacificDateKey } from "@arbor/format";
import { v } from "convex/values";
import { customAlphabet } from "nanoid";
import { hashPassword } from "better-auth/crypto";
import { api, components } from "./_generated/api";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  loadInvoiceCrewRateSettings,
  normalizeCompensationRateMode,
  normalizePayrollMethod,
  resolveUserCompensationHourlyRateUsd,
} from "./lib/crewCompensation";
import { resolveProfileMembership } from "./lib/userVerticals";
import { assertE2eHelpersEnabled } from "./lib/e2eGuard";
import { findAuthUsersByIds } from "./lib/auth";
import { deleteEventRecord, deleteInvoiceRecord } from "./lib/bookingChainDelete";
import { listEventsLinkedToRequest } from "./lib/bookingDayLoad";
import { inviteAcceptUrl } from "./email/constants";
import { enqueueEmail } from "./email/enqueue";
import { scheduleUserInviteEmail } from "./email/invitations";
import { ensurePostMortemFeedbackRow } from "./postMortemFeedback";
import {
  allocateBandPaymentConfirmationToken,
  allocateRequestNumber,
} from "./lib/publicReferenceIds";
import { listFulfillmentPackageBom } from "./lib/packageBom";

const makeToken = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 24);
const makeInvoiceSuffix = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  7,
);

function getId(record: unknown): string | null {
  if (!record || typeof record !== "object") return null;
  const candidate = record as { id?: unknown; _id?: unknown };
  if (typeof candidate.id === "string") return candidate.id;
  if (typeof candidate._id === "string") return candidate._id;
  return null;
}


/**
 * Test-only: upsert a known admin user/password for Playwright login.
 * Gated by E2E_HELPERS=true and localhost SITE_URL.
 */
export const ensureAdmin = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.literal(true),
    email: v.string(),
    userId: v.string(),
    organizationId: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const name = (args.name ?? "E2E Admin").trim() || "E2E Admin";
    if (!email) throw new Error("Email is required.");
    if (args.password.length < 8) throw new Error("Password must be at least 8 characters.");

    const now = Date.now();
    const existingUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    });

    let userId = getId(existingUser);
    if (!existingUser) {
      const createdUser = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "user",
          data: {
            name,
            email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
            role: "admin",
          },
        },
      });
      userId = getId(createdUser);
    } else {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "user",
          where: [{ field: "email", value: email }],
          update: { role: "admin", name, updatedAt: now, emailVerified: true },
        },
      });
    }
    if (!userId) throw new Error("Unable to resolve e2e admin user id.");

    const passwordHash = await hashPassword(args.password);
    const existingCredentialAccount = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [
        { field: "providerId", value: "credential" },
        { connector: "AND", field: "accountId", value: email },
      ],
    });
    if (!existingCredentialAccount) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "account",
          data: {
            accountId: email,
            providerId: "credential",
            userId,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          },
        },
      });
    } else {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "account",
          where: [
            { field: "providerId", value: "credential" },
            { connector: "AND", field: "accountId", value: email },
          ],
          update: { password: passwordHash, updatedAt: now },
        },
      });
    }

    const existingOrg = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "organization",
      where: [{ field: "slug", value: "arbor-live" }],
    });
    let organizationId = getId(existingOrg);
    if (!organizationId) {
      const createdOrg = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "organization",
          data: { name: "Arbor Live", slug: "arbor-live", createdAt: now },
        },
      });
      organizationId = getId(createdOrg);
    }
    if (!organizationId) throw new Error("Unable to resolve Arbor Live organization.");

    const existingMember = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "member",
      where: [
        { field: "organizationId", value: organizationId },
        { connector: "AND", field: "userId", value: userId },
      ],
    });
    if (!existingMember) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "member",
          data: {
            organizationId,
            userId,
            role: "admin",
            createdAt: now,
          },
        },
      });
    } else {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "member",
          where: [
            { field: "organizationId", value: organizationId },
            { connector: "AND", field: "userId", value: userId },
          ],
          update: { role: "admin" },
        },
      });
    }

    const existingOrgProfile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (existingOrgProfile) {
      await ctx.db.patch(existingOrgProfile._id, {
        organizationType: "arbor_internal",
        displayName: existingOrgProfile.displayName ?? "Arbor Live",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("organizationProfiles", {
        organizationId,
        organizationType: "arbor_internal",
        displayName: "Arbor Live",
        updatedAt: now,
      });
    }

    const existingAppMembership = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", userId!).eq("organizationId", organizationId!),
      )
      .unique();
    if (existingAppMembership) {
      await ctx.db.patch(existingAppMembership._id, {
        role: "admin",
        active: true,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userOrganizationMemberships", {
        userId,
        organizationId,
        role: "admin",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingUserProfile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId!))
      .unique();
    if (existingUserProfile) {
      await ctx.db.patch(existingUserProfile._id, {
        active: true,
        defaultOrganizationId: organizationId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userAdminProfiles", {
        userId,
        active: true,
        verticals: [],
        disciplines: [],
        defaultOrganizationId: organizationId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingActiveOrg = await ctx.db
      .query("userActiveOrganizations")
      .withIndex("by_userId", (q) => q.eq("userId", userId!))
      .unique();
    if (existingActiveOrg) {
      await ctx.db.patch(existingActiveOrg._id, {
        organizationId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userActiveOrganizations", {
        userId,
        organizationId,
        updatedAt: now,
      });
    }

    const existingOnboarding = await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", userId!))
      .unique();
    if (existingOnboarding) {
      await ctx.db.patch(existingOnboarding._id, {
        status: "waived",
        waivedAt: now,
        waivedByUserId: userId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userOnboarding", {
        userId,
        flow: "crew",
        status: "waived",
        waivedAt: now,
        waivedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { ok: true as const, email, userId, organizationId };
  },
});

/**
 * Test-only: create a pending invite token without going through the admin UI.
 */
export const createPendingInvite = mutation({
  args: {
    email: v.string(),
    organizationId: v.optional(v.string()),
  },
  returns: v.object({
    url: v.string(),
    token: v.string(),
    email: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
    const now = Date.now();
    const expiresAt = now + 14 * 24 * 60 * 60 * 1000;

    let organizationId = args.organizationId?.trim() || "";
    if (!organizationId) {
      const existingOrg = await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "organization",
        where: [{ field: "slug", value: "arbor-live" }],
      });
      organizationId = getId(existingOrg) ?? "";
    }
    if (!organizationId) throw new Error("Arbor Live organization not found.");

    const created = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "invitation",
        data: {
          organizationId,
          email,
          role: "member",
          status: "pending",
          expiresAt,
          createdAt: now,
          inviterId: "e2e-inviter",
        },
      },
    });
    const invitationId = getId(created);
    if (!invitationId) throw new Error("Failed to create invitation.");

    const token = makeToken();
    await ctx.db.insert("pendingUserInvites", {
      invitationId,
      token,
      email,
      organizationId,
      role: "member",
      verticals: [],
      disciplines: [],
      expiresAt,
      createdAt: now,
    });

    return {
      email,
      token,
      url: inviteAcceptUrl(token),
    };
  },
});

/**
 * Test-only: resolve the accept-invite URL for a pending invite email.
 * Gated by E2E_HELPERS=true and localhost SITE_URL.
 */
export const getInviteAcceptUrl = query({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      url: v.string(),
      token: v.string(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const rows = await ctx.db.query("pendingUserInvites").order("desc").take(100);
    const match = rows.find((row) => row.email === email);
    if (!match) return null;
    return {
      url: inviteAcceptUrl(match.token),
      token: match.token,
      expiresAt: match.expiresAt,
    };
  },
});

async function insertPendingPublicQuote(
  ctx: MutationCtx,
  args?: { clientGroupName?: string },
) {
  const now = Date.now();
  const publicApprovalToken = makeToken();
  const invoiceNumber = `ALINV-${makeInvoiceSuffix()}`;
  const invoiceId = await ctx.db.insert("invoices", {
    invoiceNumber,
    status: "draft",
    issueDate: new Date(now).toISOString().slice(0, 10),
    managerUserId: "e2e-manager",
    managerName: "E2E Admin",
    managerEmail: "e2e-admin@arborlive.test",
    clientGroupName: args?.clientGroupName?.trim() || "E2E Quote Client",
    clientContactName: "E2E Contact",
    clientEmail: "e2e-client@example.com",
    equipmentPricingMode: "nonSubsidized",
    crewRateMode: "normal",
    discountType: "amount",
    discountValue: 0,
    discountAmountUsd: 0,
    equipmentSubtotalUsd: 100,
    externalRentalsSubtotalUsd: 0,
    artistsSubtotalUsd: 0,
    crewSubtotalUsd: 0,
    feesSubtotalUsd: 0,
    subtotalUsd: 100,
    totalUsd: 100,
    clientApprovalStatus: "pending",
    publicApprovalToken,
    publicApprovalTokenExpiresAt: now + 14 * 24 * 60 * 60 * 1000,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("invoiceLineItems", {
    invoiceId,
    section: "equipment_type",
    order: 0,
    label: "E2E Smoke Line",
    quantity: 1,
    rateUsd: 100,
    amountUsd: 100,
    createdAt: now,
    updatedAt: now,
  });
  return {
    invoiceId,
    invoiceNumber,
    publicApprovalToken,
    path: `/event/${publicApprovalToken}`,
  };
}

/**
 * Test-only: mint a minimal draft invoice with a public approval token.
 * Gated by E2E_HELPERS=true and localhost SITE_URL.
 */
export const seedMinimalPublicQuote = mutation({
  args: {
    clientGroupName: v.optional(v.string()),
  },
  returns: v.object({
    invoiceId: v.id("invoices"),
    invoiceNumber: v.string(),
    publicApprovalToken: v.string(),
    path: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    return await insertPendingPublicQuote(ctx, args);
  },
});

function futureEventWindow(daysAhead = 14) {
  const dateKey = pacificDateKey(addPacificCalendarDays(Date.now(), daysAhead));
  const startAt = pacificDateAndTimeToMs(dateKey, "18:00")!;
  const endAt = pacificDateAndTimeToMs(dateKey, "22:00")!;
  return { startAt, endAt, dateKey };
}

async function insertSubmittedBookingRequest(ctx: MutationCtx, eventName?: string) {
  const now = Date.now();
  const { startAt, endAt, dateKey } = futureEventWindow(18);
  const requestNumber = await allocateRequestNumber(ctx);
  const publicToken = makeToken();
  const resolvedEventName = eventName?.trim() || `E2E Booking ${now}`;
  const eventDateText = dateKey;
  const eventStartTimeText = "18:00";
  const eventEndTimeText = "22:00";
  const setupAtMs = startAt - 2 * 60 * 60 * 1000;

  const requestId = await ctx.db.insert("eventRequests", {
    status: "submitted",
    requestNumber,
    publicToken,
    firstName: "E2E",
    lastName: "Requester",
    email: "e2e.requester@stanford.edu",
    phone: "6505550100",
    organization: "E2E Test Org",
    sponsorType: "Large Volunteer Student Organization",
    venueName: "E2E Venue",
    eventDateText,
    eventStartTimeText,
    eventEndTimeText,
    earliestSetupText: "2 hours before",
    eventStartAtMs: startAt,
    eventEndAtMs: endAt,
    setupAtMs,
    flexibleSetupTime: true,
    showSlots: [
      {
        date: dateKey,
        startTime: "18:00",
        endTime: "22:00",
        startAtMs: startAt,
        endAtMs: endAt,
        endsNextDay: false,
      },
    ],
    eventName: resolvedEventName,
    eventCategory: "Concert / Showcase",
    crewOrRental: "Crewed",
    servicesNeeded: ["Sound"],
    expectedTurnout: 80,
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return {
    requestId,
    requestNumber,
    publicToken,
    eventName: resolvedEventName,
    startAt,
    endAt,
  };
}

/**
 * Test-only: latest email notification for assertions (invite/quote/etc.).
 */
export const getLatestEmailNotification = query({
  args: {
    to: v.optional(v.string()),
    template: v.optional(v.string()),
    afterCreatedAt: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("emailNotifications"),
      template: v.string(),
      status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
      to: v.string(),
      subject: v.string(),
      resendId: v.optional(v.string()),
      error: v.optional(v.string()),
      createdAt: v.number(),
      sentAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const to = args.to?.trim().toLowerCase();
    const rows = await ctx.db.query("emailNotifications").order("desc").take(200);
    const match = rows.find((row) => {
      if (to && row.to.toLowerCase() !== to) return false;
      if (args.template && row.template !== args.template) return false;
      if (args.afterCreatedAt !== undefined && row.createdAt < args.afterCreatedAt) return false;
      return true;
    });
    if (!match) return null;
    return {
      id: match._id,
      template: match.template,
      status: match.status,
      to: match.to,
      subject: match.subject,
      resendId: match.resendId,
      error: match.error,
      createdAt: match.createdAt,
      sentAt: match.sentAt,
    };
  },
});

export const getInvoiceApprovalState = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      invoiceId: v.id("invoices"),
      invoiceNumber: v.string(),
      clientApprovalStatus: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("changes_requested"),
      ),
      publicApprovalToken: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const invoice = await ctx.db
      .query("invoices")
      .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", args.token))
      .unique();
    if (!invoice?.publicApprovalToken) return null;
    return {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      clientApprovalStatus: invoice.clientApprovalStatus ?? "pending",
      publicApprovalToken: invoice.publicApprovalToken,
    };
  },
});

/**
 * Test-only: create invite + enqueue real Resend delivery to a delivered+ address.
 */
export const sendInviteEmail = mutation({
  args: {
    email: v.string(),
    organizationId: v.optional(v.string()),
  },
  returns: v.object({
    email: v.string(),
    token: v.string(),
    url: v.string(),
    invitationId: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    if (!email.endsWith("@arborlive.test") && !email.endsWith("@resend.dev")) {
      throw new Error("sendInviteEmail requires an @arborlive.test (mock) or @resend.dev address.");
    }
    const now = Date.now();
    const expiresAt = now + 14 * 24 * 60 * 60 * 1000;

    let organizationId = args.organizationId?.trim() || "";
    if (!organizationId) {
      const existingOrg = await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "organization",
        where: [{ field: "slug", value: "arbor-live" }],
      });
      organizationId = getId(existingOrg) ?? "";
    }
    if (!organizationId) throw new Error("Arbor Live organization not found.");

    // Prefer a real Better Auth user as inviter so getInviterName can resolve.
    const adminUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: "e2e-admin@arborlive.test" }],
    });
    const inviterId = getId(adminUser);
    if (!inviterId) {
      throw new Error("e2e-admin@arborlive.test missing; run ensureAdmin first.");
    }

    const created = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "invitation",
        data: {
          organizationId,
          email,
          role: "member",
          status: "pending",
          expiresAt,
          createdAt: now,
          inviterId,
        },
      },
    });
    const invitationId = getId(created);
    if (!invitationId) throw new Error("Failed to create invitation.");

    await scheduleUserInviteEmail(ctx, {
      invitationId,
      email,
      organizationId,
      role: "member",
      inviterId,
      expiresAt,
      isExistingUser: false,
      resendKey: `e2e:${now}`,
    });

    const pending = await ctx.db
      .query("pendingUserInvites")
      .withIndex("by_invitationId", (q) => q.eq("invitationId", invitationId))
      .unique();
    if (!pending) throw new Error("Pending invite token missing after schedule.");

    return {
      email,
      invitationId,
      token: pending.token,
      url: inviteAcceptUrl(pending.token),
    };
  },
});

/**
 * Test-only: enqueue a lightweight smoke email through the normal queue → Resend path.
 */
export const enqueueSmokeEmail = mutation({
  args: {
    to: v.string(),
    subject: v.optional(v.string()),
  },
  returns: v.object({ notificationId: v.id("emailNotifications") }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const to = args.to.trim().toLowerCase();
    if (!to.endsWith("@arborlive.test") && !to.endsWith("@resend.dev")) {
      throw new Error("enqueueSmokeEmail requires an @arborlive.test (mock) or @resend.dev address.");
    }
    const subject = args.subject?.trim() || `E2E smoke ${Date.now()}`;
    const notificationId = await enqueueEmail(ctx, {
      template: "email_verification",
      to,
      subject,
      idempotencyKey: `e2e_smoke:${to}:${Date.now()}`,
      payload: {
        verificationUrl: "http://localhost:3000/sign-in",
        recipientEmail: to,
      },
    });
    return { notificationId };
  },
});

export const seedCrewedEventWithSchedule = mutation({
  args: {
    title: v.optional(v.string()),
    /**
     * Also seed the venue + event-manager contact that
     * `assertTraineeIntroReady` requires before a trainee can be assigned.
     */
    traineeReady: v.optional(v.boolean()),
  },
  returns: v.object({
    eventId: v.id("events"),
    title: v.string(),
    path: v.string(),
    schedulePath: v.string(),
    blockIds: v.array(v.id("eventScheduleBlocks")),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const { startAt, endAt } = futureEventWindow(16);
    const title = args.title?.trim() || `E2E Seeded Event ${now}`;
    const eventId = await ctx.db.insert("events", {
      title,
      status: "tentative",
      visibility: "public",
      publicToken: makeToken(),
      startAt,
      endAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      eventType: "Crewed Event",
      // Match crew discipline names used by availability filtering.
      teamsInterested: ["Sound"],
      createdAt: now,
      updatedAt: now,
    });

    const showStart = startAt;
    const showEnd = endAt;
    const setupStart = showStart - 2 * 60 * 60 * 1000;
    const setupEnd = showStart;
    const strikeStart = showEnd;
    const strikeEnd = showEnd + 60 * 60 * 1000;
    const blocks = [
      { blockType: "setup" as const, label: "Setup", startsAt: setupStart, endsAt: setupEnd },
      { blockType: "show" as const, label: "Show", startsAt: showStart, endsAt: showEnd },
      { blockType: "strike" as const, label: "Strike", startsAt: strikeStart, endsAt: strikeEnd },
    ];
    const blockIds: Id<"eventScheduleBlocks">[] = [];
    for (const block of blocks) {
      const blockId = await ctx.db.insert("eventScheduleBlocks", {
        eventId,
        blockType: block.blockType,
        label: block.label,
        dayIndex: 0,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        createdAt: now,
        updatedAt: now,
      });
      blockIds.push(blockId);
    }

    if (args.traineeReady) {
      const venueName = `E2E Trainee Venue ${now}`;
      const venueId = await ctx.db.insert("venues", {
        name: venueName,
        path: venueName,
        kind: "indoor",
        venueType: "Test Venue",
        address: "450 Serra Mall, Stanford, CA 94305",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(eventId, { venueId, venueName, updatedAt: now });
      await ctx.db.insert("eventPeopleAssignments", {
        eventId,
        assignmentType: "event_manager",
        personName: "E2E Event Manager",
        contactEmail: "e2e-manager@arborlive.test",
        contactPhone: "6505550100",
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      eventId,
      title,
      path: `/dashboard/events/${eventId}`,
      schedulePath: `/dashboard/events/${eventId}/schedule`,
      blockIds,
    };
  },
});

export const seedApprovablePublicQuote = mutation({
  args: {
    clientGroupName: v.optional(v.string()),
  },
  returns: v.object({
    invoiceId: v.id("invoices"),
    invoiceNumber: v.string(),
    publicApprovalToken: v.string(),
    path: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    return await insertPendingPublicQuote(ctx, args);
  },
});

/**
 * Test-only: approved quote linked to an event (payment proof eligible).
 */
export const seedApprovedQuoteWithLinkedEvent = mutation({
  args: {
    clientGroupName: v.optional(v.string()),
  },
  returns: v.object({
    invoiceId: v.id("invoices"),
    eventId: v.id("events"),
    invoiceNumber: v.string(),
    publicApprovalToken: v.string(),
    path: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const { startAt, endAt } = futureEventWindow(12);
    const publicApprovalToken = makeToken();
    const invoiceNumber = `ALINV-${makeInvoiceSuffix()}`;
    const invoiceId = await ctx.db.insert("invoices", {
      invoiceNumber,
      status: "finalized",
      issueDate: new Date(now).toISOString().slice(0, 10),
      managerUserId: "e2e-manager",
      managerName: "E2E Admin",
      managerEmail: "e2e-admin@arborlive.test",
      clientGroupName: args.clientGroupName?.trim() || "E2E Paid Client",
      clientContactName: "E2E Contact",
      clientEmail: "e2e-client@example.com",
      equipmentPricingMode: "nonSubsidized",
      crewRateMode: "normal",
      discountType: "amount",
      discountValue: 0,
      discountAmountUsd: 0,
      equipmentSubtotalUsd: 100,
      externalRentalsSubtotalUsd: 0,
      artistsSubtotalUsd: 0,
      crewSubtotalUsd: 0,
      feesSubtotalUsd: 0,
      subtotalUsd: 100,
      totalUsd: 100,
      clientApprovalStatus: "approved",
      approvedAt: now - 60_000,
      clientApprovalSignedName: "E2E Signer",
      clientIsPaymentSubmitter: true,
      publicApprovalToken,
      publicApprovalTokenExpiresAt: now + 14 * 24 * 60 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("invoiceLineItems", {
      invoiceId,
      section: "equipment_type",
      order: 0,
      label: "E2E Approved Line",
      quantity: 1,
      rateUsd: 100,
      amountUsd: 100,
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await ctx.db.insert("events", {
      title: `E2E Payment Event ${now}`,
      status: "ready",
      visibility: "public",
      publicToken: makeToken(),
      invoiceId,
      startAt,
      endAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      createdAt: now,
      updatedAt: now,
    });
    return {
      invoiceId,
      eventId,
      invoiceNumber,
      publicApprovalToken,
      path: `/event/${publicApprovalToken}`,
    };
  },
});

/**
 * Test-only: submitted booking request ready for staff convert.
 */
export const seedSubmittedBookingRequest = mutation({
  args: {
    eventName: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("submitted"),
        v.literal("in_review"),
        v.literal("converted"),
        v.literal("declined"),
      ),
    ),
  },
  returns: v.object({
    requestId: v.id("eventRequests"),
    requestNumber: v.string(),
    publicToken: v.string(),
    path: v.string(),
    trackPath: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const seeded = await insertSubmittedBookingRequest(ctx, args.eventName);
    if (args.status && args.status !== "submitted") {
      const now = Date.now();
      const patch: {
        status: typeof args.status;
        updatedAt: number;
        declinedAt?: number;
        declineReasonCode?: "capacity";
        reviewedAt?: number;
        reviewedByUserId?: string;
      } = { status: args.status, updatedAt: now };
      if (args.status === "declined") {
        patch.declinedAt = now;
        patch.declineReasonCode = "capacity";
      }
      if (args.status === "in_review") {
        patch.reviewedAt = now;
        patch.reviewedByUserId = "e2e-manager";
      }
      await ctx.db.patch(seeded.requestId, patch);
    }
    return {
      requestId: seeded.requestId,
      requestNumber: seeded.requestNumber,
      publicToken: seeded.publicToken,
      path: `/dashboard/events/requests/${seeded.requestId}`,
      trackPath: `/request/track/${seeded.publicToken}`,
    };
  },
});

/**
 * Test-only: converted booking request with quote already on the request track portal.
 * Avoids the heavy invoice-editor UI path that flakes under anonymous CI Convex limits.
 */
export const seedBookingReadyForTrackApprove = mutation({
  args: {
    eventName: v.optional(v.string()),
  },
  returns: v.object({
    requestId: v.id("eventRequests"),
    invoiceId: v.id("invoices"),
    eventId: v.id("events"),
    requestNumber: v.string(),
    publicToken: v.string(),
    trackPath: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const seeded = await insertSubmittedBookingRequest(ctx, args.eventName);
    const invoiceNumber = `ALINV-${makeInvoiceSuffix()}`;
    const invoiceId = await ctx.db.insert("invoices", {
      invoiceNumber,
      status: "finalized",
      issueDate: new Date(now).toISOString().slice(0, 10),
      managerUserId: "e2e-manager",
      managerName: "E2E Admin",
      managerEmail: "e2e-admin@arborlive.test",
      clientGroupName: seeded.eventName,
      clientContactName: "E2E Requester",
      clientEmail: "e2e.requester@stanford.edu",
      clientPhone: "6505550100",
      equipmentPricingMode: "nonSubsidized",
      crewRateMode: "normal",
      discountType: "amount",
      discountValue: 0,
      discountAmountUsd: 0,
      equipmentSubtotalUsd: 100,
      externalRentalsSubtotalUsd: 0,
      artistsSubtotalUsd: 0,
      crewSubtotalUsd: 0,
      feesSubtotalUsd: 0,
      subtotalUsd: 100,
      totalUsd: 100,
      clientApprovalStatus: "pending",
      sourceEventRequestId: seeded.requestId,
      clientReviewReadyAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("invoiceLineItems", {
      invoiceId,
      section: "equipment_type",
      order: 0,
      label: "E2E Track Quote Line",
      quantity: 1,
      rateUsd: 100,
      amountUsd: 100,
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await ctx.db.insert("events", {
      title: seeded.eventName,
      status: "tentative",
      visibility: "public",
      publicToken: makeToken(),
      startAt: seeded.startAt,
      endAt: seeded.endAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      venueName: "E2E Venue",
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      category: "Concert / Showcase",
      host: "E2E Test Org",
      expectedTurnout: 80,
      invoiceId,
      sourceEventRequestId: seeded.requestId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(seeded.requestId, {
      status: "converted",
      convertedEventId: eventId,
      convertedEventIds: [eventId],
      linkedInvoiceId: invoiceId,
      reviewedByUserId: "e2e-manager",
      updatedAt: now,
    });
    return {
      requestId: seeded.requestId,
      invoiceId,
      eventId,
      requestNumber: seeded.requestNumber,
      publicToken: seeded.publicToken,
      trackPath: `/request/track/${seeded.publicToken}`,
    };
  },
});
/**
 * Test-only: a completed (ended) event linked to a finalized invoice, with a
 * public photo album, for the post-event portal section (album link + feedback
 * form). `portal` selects which public portal the invoice is reachable through.
 */
export const seedPastLinkedEventForFeedback = mutation({
  args: {
    portal: v.optional(v.union(v.literal("quote"), v.literal("request"))),
  },
  returns: v.object({
    invoiceId: v.id("invoices"),
    eventId: v.id("events"),
    invoiceNumber: v.string(),
    path: v.string(),
    albumShareUrl: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const portal = args.portal ?? "quote";
    const now = Date.now();
    const { startAt, endAt } = futureEventWindow(-2);
    const albumShareUrl = `https://photos.arbor.st/share/e2e-${makeInvoiceSuffix()}`;

    const insertEventAndAlbum = async (invoiceId: Id<"invoices">) => {
      const eventId = await ctx.db.insert("events", {
        title: `E2E Past Event ${now}`,
        status: "completed",
        visibility: "public",
        publicToken: makeToken(),
        invoiceId,
        startAt,
        endAt,
        timezone: "America/Los_Angeles",
        spansMultipleDays: false,
        setupOnly: false,
        strikeOnly: false,
        requiresShowWindow: true,
        venueName: "E2E Past Venue",
        eventType: "Crewed Event",
        teamsInterested: ["Sound"],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("immichAlbumLinks", {
        entityType: "event",
        entityId: eventId,
        immichAlbumId: `e2e-album-${eventId}`,
        albumName: "E2E Past Event Album",
        shareUrl: albumShareUrl,
        createdAt: now,
        updatedAt: now,
      });
      return eventId;
    };

    if (portal === "quote") {
      const publicApprovalToken = makeToken();
      const invoiceNumber = `ALINV-${makeInvoiceSuffix()}`;
      const invoiceId = await ctx.db.insert("invoices", {
        invoiceNumber,
        status: "finalized",
        issueDate: new Date(now).toISOString().slice(0, 10),
        managerUserId: "e2e-manager",
        managerName: "E2E Admin",
        managerEmail: "e2e-admin@arborlive.test",
        clientGroupName: "E2E Past Client",
        clientContactName: "E2E Contact",
        clientEmail: "e2e-client@example.com",
        equipmentPricingMode: "nonSubsidized",
        crewRateMode: "normal",
        discountType: "amount",
        discountValue: 0,
        discountAmountUsd: 0,
        equipmentSubtotalUsd: 100,
        externalRentalsSubtotalUsd: 0,
        artistsSubtotalUsd: 0,
        crewSubtotalUsd: 0,
        feesSubtotalUsd: 0,
        subtotalUsd: 100,
        totalUsd: 100,
        clientApprovalStatus: "approved",
        approvedAt: now - 60_000,
        clientApprovalSignedName: "E2E Signer",
        clientIsPaymentSubmitter: true,
        publicApprovalToken,
        publicApprovalTokenExpiresAt: now + 14 * 24 * 60 * 60 * 1000,
        clientReviewReadyAt: now - 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
      });
      const eventId = await insertEventAndAlbum(invoiceId);
      return {
        invoiceId,
        eventId,
        invoiceNumber,
        path: `/event/${publicApprovalToken}`,
        albumShareUrl,
      };
    }

    const seeded = await insertSubmittedBookingRequest(ctx);
    const invoiceNumber = `ALINV-${makeInvoiceSuffix()}`;
    const invoiceId = await ctx.db.insert("invoices", {
      invoiceNumber,
      status: "finalized",
      issueDate: new Date(now).toISOString().slice(0, 10),
      managerUserId: "e2e-manager",
      managerName: "E2E Admin",
      managerEmail: "e2e-admin@arborlive.test",
      clientGroupName: seeded.eventName,
      clientContactName: "E2E Requester",
      clientEmail: "e2e.requester@stanford.edu",
      equipmentPricingMode: "nonSubsidized",
      crewRateMode: "normal",
      discountType: "amount",
      discountValue: 0,
      discountAmountUsd: 0,
      equipmentSubtotalUsd: 100,
      externalRentalsSubtotalUsd: 0,
      artistsSubtotalUsd: 0,
      crewSubtotalUsd: 0,
      feesSubtotalUsd: 0,
      subtotalUsd: 100,
      totalUsd: 100,
      clientApprovalStatus: "approved",
      approvedAt: now - 60_000,
      clientApprovalSignedName: "E2E Signer",
      clientIsPaymentSubmitter: true,
      sourceEventRequestId: seeded.requestId,
      clientReviewReadyAt: now - 24 * 60 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await insertEventAndAlbum(invoiceId);
    await ctx.db.patch(seeded.requestId, {
      status: "converted",
      convertedEventId: eventId,
      convertedEventIds: [eventId],
      linkedInvoiceId: invoiceId,
      reviewedByUserId: "e2e-manager",
      updatedAt: now,
    });
    return {
      invoiceId,
      eventId,
      invoiceNumber,
      path: `/request/track/${seeded.publicToken}`,
      albumShareUrl,
    };
  },
});

/**
 * Test-only: a completed event with a submitted feedback row in range, for the
 * Insights Feedback tab. Returns the values the UI should surface verbatim.
 */
export const seedEventFeedbackForInsights = mutation({
  args: {},
  returns: v.object({
    eventTitle: v.string(),
    invoiceNumber: v.string(),
    comments: v.string(),
    rating: v.number(),
  }),
  handler: async (ctx) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const eventTitle = `E2E Feedback Event ${now}`;
    const invoiceNumber = `ALINV-${makeInvoiceSuffix()}`;
    const invoiceId = await ctx.db.insert("invoices", {
      invoiceNumber,
      status: "finalized",
      issueDate: new Date(now).toISOString().slice(0, 10),
      managerUserId: "e2e-manager",
      managerName: "E2E Admin",
      managerEmail: "e2e-admin@arborlive.test",
      clientGroupName: "E2E Feedback Client",
      clientContactName: "E2E Contact",
      clientEmail: "e2e-client@example.com",
      equipmentPricingMode: "nonSubsidized",
      crewRateMode: "normal",
      discountType: "amount",
      discountValue: 0,
      discountAmountUsd: 0,
      equipmentSubtotalUsd: 100,
      externalRentalsSubtotalUsd: 0,
      artistsSubtotalUsd: 0,
      crewSubtotalUsd: 0,
      feesSubtotalUsd: 0,
      subtotalUsd: 100,
      totalUsd: 100,
      clientApprovalStatus: "approved",
      approvedAt: now - 60_000,
      clientApprovalSignedName: "E2E Signer",
      clientIsPaymentSubmitter: true,
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await ctx.db.insert("events", {
      title: eventTitle,
      status: "completed",
      visibility: "public",
      publicToken: makeToken(),
      invoiceId,
      startAt: now - 2 * 24 * 60 * 60 * 1000,
      endAt: now - 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      venueName: "E2E Feedback Venue",
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      createdAt: now,
      updatedAt: now,
    });
    const comments = `E2E full feedback ${now} — the crew was fantastic and the setup ran early. Would book again.`;
    await ctx.db.insert("eventFeedback", {
      eventId,
      invoiceId,
      sourceToken: makeToken(),
      portal: "quote",
      rating: 5,
      comments,
      submittedAt: now,
      createdAt: now,
    });
    return { eventTitle, invoiceNumber, comments, rating: 5 };
  },
});

/**
 * Test-only: a past event with a minted post-mortem form for a day-of lead, so
 * the public post-mortem page can be exercised. Returns the public path.
 */
async function ensureE2eLeadUser(ctx: MutationCtx): Promise<{ userId: string; name: string }> {
  const now = Date.now();
  const email = "e2e-lead@arborlive.test";
  const name = "E2E Lead";
  const existingUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email }],
  });
  let userId = getId(existingUser);
  if (!existingUser) {
    const createdUser = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name,
          email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
          role: "user",
        },
      },
    });
    userId = getId(createdUser);
  }
  if (!userId) throw new Error("Unable to resolve e2e lead user id.");
  return { userId, name };
}

export const seedPostMortemForm = mutation({
  args: {},
  returns: v.object({
    eventId: v.id("events"),
    path: v.string(),
    eventTitle: v.string(),
  }),
  handler: async (ctx) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const eventTitle = `E2E Post-mortem Event ${now}`;
    const { startAt, endAt } = futureEventWindow(-2);
    const { userId } = await ensureE2eLeadUser(ctx);
    const eventId = await ctx.db.insert("events", {
      title: eventTitle,
      status: "completed",
      visibility: "internal",
      startAt,
      endAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      venueName: "E2E Post-mortem Venue",
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      dayOfLeadUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const row = await ensurePostMortemFeedbackRow(ctx, eventId, userId);
    return { eventId, path: `/postmortem/${row.token}`, eventTitle };
  },
});

/**
 * Test-only: a completed event with a submitted post-mortem row in range, for
 * the Insights Feedback tab. Returns the values the UI should surface verbatim.
 */
export const seedPostMortemForInsights = mutation({
  args: {},
  returns: v.object({
    eventTitle: v.string(),
    leadName: v.string(),
    rating: v.number(),
    whatWentWell: v.string(),
    whatCouldImprove: v.string(),
  }),
  handler: async (ctx) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const eventTitle = `E2E Post-mortem Event ${now}`;
    const { startAt, endAt } = futureEventWindow(-2);
    const { userId, name } = await ensureE2eLeadUser(ctx);
    const eventId = await ctx.db.insert("events", {
      title: eventTitle,
      status: "completed",
      visibility: "internal",
      startAt,
      endAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      venueName: "E2E Post-mortem Venue",
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      dayOfLeadUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    const whatWentWell = `E2E went well ${now} — clear call times and a sharp crew.`;
    const whatCouldImprove = `E2E improvement ${now} — patch panels could use better labeling.`;
    const row = await ensurePostMortemFeedbackRow(ctx, eventId, userId);
    await ctx.db.patch(row._id, {
      rating: 5,
      whatWentWell,
      whatCouldImprove,
      submittedAt: now,
    });
    return { eventTitle, leadName: name, rating: 5, whatWentWell, whatCouldImprove };
  },
});

/**
 * Test-only: delete every rider for a band org so rider-creation tests are not
 * blocked by the per-band rider cap left behind by previous runs.
 */
export const clearBandRiders = mutation({
  args: { organizationId: v.string() },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const rows = await ctx.db
      .query("bandRiders")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .take(100);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return { deleted: rows.length };
  },
});

/**
 * Test-only: upsert a crew member with Sound discipline for availability flows.
 */
export const ensureCrewUser = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.literal(true),
    email: v.string(),
    userId: v.string(),
    organizationId: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const name = (args.name ?? "E2E Crew").trim() || "E2E Crew";
    if (!email) throw new Error("Email is required.");
    if (args.password.length < 8) throw new Error("Password must be at least 8 characters.");

    const now = Date.now();
    const existingUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    });

    let userId = getId(existingUser);
    if (!existingUser) {
      const createdUser = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "user",
          data: {
            name,
            email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
            role: "user",
          },
        },
      });
      userId = getId(createdUser);
    } else {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "user",
          where: [{ field: "email", value: email }],
          update: {
            name,
            updatedAt: now,
            emailVerified: true,
            // Clear any ban left behind by a remove-access spec that failed
            // before it reactivated. Otherwise the next run starts with a user
            // the app treats as signed-out, and every later step fails for a
            // reason that has nothing to do with the code under test.
            banned: false,
            banReason: null,
            banExpires: null,
          },
        },
      });
    }
    if (!userId) throw new Error("Unable to resolve e2e crew user id.");

    const passwordHash = await hashPassword(args.password);
    const existingCredentialAccount = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [
        { field: "providerId", value: "credential" },
        { connector: "AND", field: "accountId", value: email },
      ],
    });
    if (!existingCredentialAccount) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "account",
          data: {
            accountId: email,
            providerId: "credential",
            userId,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          },
        },
      });
    } else {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "account",
          where: [
            { field: "providerId", value: "credential" },
            { connector: "AND", field: "accountId", value: email },
          ],
          update: { password: passwordHash, updatedAt: now },
        },
      });
    }

    const existingOrg = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "organization",
      where: [{ field: "slug", value: "arbor-live" }],
    });
    const organizationId = getId(existingOrg);
    if (!organizationId) throw new Error("Arbor Live organization not found. Run ensureAdmin first.");

    const existingMember = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "member",
      where: [
        { field: "organizationId", value: organizationId },
        { connector: "AND", field: "userId", value: userId },
      ],
    });
    if (!existingMember) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "member",
          data: {
            organizationId,
            userId,
            role: "member",
            createdAt: now,
          },
        },
      });
    }

    const existingAppMembership = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", userId!).eq("organizationId", organizationId),
      )
      .unique();
    if (existingAppMembership) {
      await ctx.db.patch(existingAppMembership._id, {
        role: "member",
        active: true,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userOrganizationMemberships", {
        userId,
        organizationId,
        role: "member",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingUserProfile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId!))
      .unique();
    if (existingUserProfile) {
      await ctx.db.patch(existingUserProfile._id, {
        active: true,
        verticals: ["Crew"],
        disciplines: ["Sound"],
        defaultOrganizationId: organizationId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userAdminProfiles", {
        userId,
        active: true,
        verticals: ["Crew"],
        disciplines: ["Sound"],
        defaultOrganizationId: organizationId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingActiveOrg = await ctx.db
      .query("userActiveOrganizations")
      .withIndex("by_userId", (q) => q.eq("userId", userId!))
      .unique();
    if (existingActiveOrg) {
      await ctx.db.patch(existingActiveOrg._id, {
        organizationId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userActiveOrganizations", {
        userId,
        organizationId,
        updatedAt: now,
      });
    }

    const existingOnboarding = await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", userId!))
      .unique();
    if (existingOnboarding) {
      await ctx.db.patch(existingOnboarding._id, {
        status: "waived",
        waivedAt: now,
        waivedByUserId: userId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userOnboarding", {
        userId,
        flow: "crew",
        status: "waived",
        waivedAt: now,
        waivedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { ok: true as const, email, userId, organizationId };
  },
});

/**
 * Test-only: insert a Yes availability response for a crew user on an event.
 */
export const seedCrewYesResponse = mutation({
  args: {
    eventId: v.id("events"),
    userId: v.string(),
  },
  returns: v.object({ responseId: v.id("eventCrewAvailabilityResponses") }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const existing = await ctx.db
      .query("eventCrewAvailabilityResponses")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", args.eventId).eq("userId", args.userId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        responseStatus: "yes",
        partialWindows: undefined,
        notes: "E2E seeded yes",
        respondedAt: now,
        updatedAt: now,
      });
      return { responseId: existing._id };
    }
    const responseId = await ctx.db.insert("eventCrewAvailabilityResponses", {
      eventId: args.eventId,
      userId: args.userId,
      responseStatus: "yes",
      notes: "E2E seeded yes",
      respondedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { responseId };
  },
});

/**
 * Test-only: assign a crew user to every schedule block (avoids heavy schedule UI under local Convex).
 */
export const seedAssignCrewToAllBlocks = mutation({
  args: {
    eventId: v.id("events"),
    userId: v.string(),
    personName: v.optional(v.string()),
  },
  returns: v.object({
    shiftIds: v.array(v.id("eventCrewShifts")),
    blockCount: v.number(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
      .take(50);
    if (blocks.length === 0) throw new Error("Event has no schedule blocks.");

    const existing = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    const personName = args.personName?.trim() || "E2E Crew";
    const shiftIds: Id<"eventCrewShifts">[] = [];
    for (const block of blocks) {
      const hours = Number(((block.endsAt - block.startsAt) / 3_600_000).toFixed(2));
      const shiftId = await ctx.db.insert("eventCrewShifts", {
        eventId: args.eventId,
        scheduleBlockId: block._id,
        role: block.label || block.blockType || "Crew",
        personName,
        userId: args.userId,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        hours,
        postedToExpense: false,
        notes: "E2E seeded assignment",
        createdAt: now,
        updatedAt: now,
      });
      shiftIds.push(shiftId);
    }
    return { shiftIds, blockCount: blocks.length };
  },
});

export const getEventCrewAssignmentState = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    shiftCount: v.number(),
    assignedUserIds: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const shifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);
    const assignedUserIds = Array.from(
      new Set(
        shifts
          .map((shift) => shift.userId?.trim())
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );
    return { shiftCount: shifts.length, assignedUserIds };
  },
});

/**
 * Test-only: booking request conversion state for staff convert assertions.
 */
export const getBookingRequestState = query({
  args: { requestId: v.id("eventRequests") },
  returns: v.union(
    v.null(),
    v.object({
      status: v.string(),
      convertedEventId: v.union(v.id("events"), v.null()),
      linkedInvoiceId: v.union(v.id("invoices"), v.null()),
      requestNumber: v.union(v.string(), v.null()),
      declineReasonCode: v.union(v.string(), v.null()),
      declinedAt: v.union(v.number(), v.null()),
      convertedAt: v.union(v.number(), v.null()),
      reviewedAt: v.union(v.number(), v.null()),
      reviewedByUserId: v.union(v.string(), v.null()),
      staffNotes: v.union(v.string(), v.null()),
      assigneeUserId: v.union(v.string(), v.null()),
      assigneeName: v.union(v.string(), v.null()),
      eventType: v.union(v.string(), v.null()),
      startAt: v.union(v.number(), v.null()),
      endAt: v.union(v.number(), v.null()),
      requestStartAt: v.union(v.number(), v.null()),
      requestEndAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;
    const event = request.convertedEventId ? await ctx.db.get(request.convertedEventId) : null;
    const userByKey = request.assigneeUserId
      ? await findAuthUsersByIds(ctx, [request.assigneeUserId])
      : new Map<string, { name?: string | null; email?: string | null }>();
    const assignee = request.assigneeUserId ? userByKey.get(request.assigneeUserId) : undefined;
    return {
      status: request.status,
      convertedEventId: request.convertedEventId ?? null,
      linkedInvoiceId: request.linkedInvoiceId ?? null,
      requestNumber: request.requestNumber ?? null,
      declineReasonCode: request.declineReasonCode ?? null,
      declinedAt: request.declinedAt ?? null,
      convertedAt: request.convertedAt ?? null,
      reviewedAt: request.reviewedAt ?? null,
      reviewedByUserId: request.reviewedByUserId ?? null,
      staffNotes: request.staffNotes ?? null,
      assigneeUserId: request.assigneeUserId ?? null,
      assigneeName:
        request.assigneeUserId && assignee
          ? (assignee.name?.trim() || assignee.email?.trim() || null)
          : null,
      eventType: event?.eventType ?? null,
      startAt: event?.startAt ?? null,
      endAt: event?.endAt ?? null,
      requestStartAt: request.eventStartAtMs ?? null,
      requestEndAt: request.eventEndAtMs ?? null,
    };
  },
});

/**
 * Test-only: delete a booking-request fixture and its children directly through
 * `ctx.db` (not the product mutations). Used for afterAll cleanup — the product
 * delete guards are what the specs assert, so cleanup must not depend on
 * behaviour a failing run may have left half-applied.
 */
export const deleteBookingRequestFixture = mutation({
  args: { requestId: v.id("eventRequests") },
  returns: v.object({
    deleted: v.boolean(),
    deletedEvents: v.number(),
    deletedInvoice: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const request = await ctx.db.get(args.requestId);
    if (!request) return { deleted: false, deletedEvents: 0, deletedInvoice: false };
    let deletedEvents = 0;
    if (request.linkedInvoiceId) {
      await deleteInvoiceRecord(ctx, request.linkedInvoiceId);
    }
    for (const event of await listEventsLinkedToRequest(ctx, request)) {
      await deleteEventRecord(ctx, event._id);
      deletedEvents += 1;
    }
    const transitions = await ctx.db
      .query("statusTransitions")
      .withIndex("by_entityType_and_entityId", (q) =>
        q.eq("entityType", "eventRequest").eq("entityId", args.requestId),
      )
      .take(200);
    for (const row of transitions) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.delete(args.requestId);
    return { deleted: true, deletedEvents, deletedInvoice: Boolean(request.linkedInvoiceId) };
  },
});

/**
 * Test-only: round-robin settings row, read without auth.
 */
export const getBookingRequestSettingsState = query({
  args: {},
  returns: v.object({
    roundRobinUserIds: v.array(v.string()),
    roundRobinCursorIndex: v.number(),
  }),
  handler: async (ctx) => {
    assertE2eHelpersEnabled();
    const row = await ctx.db
      .query("bookingRequestSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    return {
      roundRobinUserIds: row?.roundRobinUserIds ?? [],
      roundRobinCursorIndex: row?.roundRobinCursorIndex ?? 0,
    };
  },
});

/**
 * Test-only: overwrite the round-robin rotation. Used to restore the default
 * (empty) rotation after the settings spec, so a failed run cannot leave the
 * shared `default` row pointed at a fixture user.
 */
export const setBookingRequestRotationState = mutation({
  args: { roundRobinUserIds: v.array(v.string()) },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const existing = await ctx.db
      .query("bookingRequestSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        roundRobinUserIds: args.roundRobinUserIds,
        roundRobinCursorIndex: 0,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("bookingRequestSettings", {
        key: "default",
        roundRobinUserIds: args.roundRobinUserIds,
        roundRobinCursorIndex: 0,
        updatedAt: now,
      });
    }
    return { ok: true as const };
  },
});

/**
 * Test-only: existence of a request and its cascade-delete children.
 */
export const getBookingRequestDeleteState = query({
  args: { requestId: v.id("eventRequests") },
  returns: v.object({
    requestExists: v.boolean(),
    invoiceExists: v.boolean(),
    eventExists: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      return { requestExists: false, invoiceExists: false, eventExists: false };
    }
    const invoice = request.linkedInvoiceId ? await ctx.db.get(request.linkedInvoiceId) : null;
    const events = await listEventsLinkedToRequest(ctx, request);
    return {
      requestExists: true,
      invoiceExists: Boolean(invoice),
      eventExists: events.length > 0,
    };
  },
});

/**
 * Test-only: resolve a Better Auth user id by email.
 */
export const getUserIdByEmail = query({
  args: { email: v.string() },
  returns: v.object({ userId: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const existingUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    });
    return { userId: getId(existingUser) };
  },
});

/**
 * Test-only: Dry Hire event with inventory type, asset, and pull-list line for fulfillment UI.
 */
export const seedDryHireWithPullList = mutation({
  args: {
    title: v.optional(v.string()),
    assetId: v.optional(v.string()),
  },
  returns: v.object({
    eventId: v.id("events"),
    title: v.string(),
    typeId: v.id("inventoryTypes"),
    typeName: v.string(),
    inventoryItemId: v.id("inventoryItems"),
    assetId: v.string(),
    pullListItemId: v.id("eventPullListItems"),
    path: v.string(),
    equipmentPath: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const { startAt, endAt } = futureEventWindow(10);
    const title = args.title?.trim() || `E2E Dry Hire ${now}`;
    const assetId = args.assetId?.trim() || `E2E-ALE-${String(now).slice(-6)}`;

    const typeName = `E2E Mic ${now}`;
    const typeId = await ctx.db.insert("inventoryTypes", {
      name: typeName,
      category: "misc",
      model: "E2E-MIC-1",
      manualUrls: [],
      capabilities: [],
      createdAt: now,
      updatedAt: now,
    });
    const inventoryItemId = await ctx.db.insert("inventoryItems", {
      assetId,
      typeId,
      status: "functional",
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await ctx.db.insert("events", {
      title,
      status: "tentative",
      visibility: "internal",
      publicToken: makeToken(),
      startAt,
      endAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      eventType: "Dry Hire",
      rentalFulfillmentMode: "delivery",
      teamsInterested: [],
      createdAt: now,
      updatedAt: now,
    });
    const pullListItemId = await ctx.db.insert("eventPullListItems", {
      eventId,
      lineKind: "type",
      typeId,
      label: "E2E Mic",
      quantityRequired: 1,
      quantityPulled: 0,
      quantityCheckedOut: 0,
      source: "manual",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });

    return {
      eventId,
      title,
      typeId,
      typeName,
      inventoryItemId,
      assetId,
      pullListItemId,
      path: `/dashboard/events/${eventId}`,
      equipmentPath: `/dashboard/events/${eventId}/equipment`,
    };
  },
});

export const getRentalFulfillmentState = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    outboundCompleted: v.boolean(),
    returnCompleted: v.boolean(),
    scannedAssetIds: v.array(v.string()),
    unitCount: v.number(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const fulfillments = await ctx.db
      .query("eventRentalFulfillments")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(20);
    const outboundCompleted = fulfillments.some(
      (row) => row.direction === "outbound" && row.status === "completed",
    );
    const returnCompleted = fulfillments.some(
      (row) => row.direction === "return" && row.status === "completed",
    );
    const units = await ctx.db
      .query("eventRentalUnits")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(100);
    const scannedAssetIds = units
      .map((unit) => unit.assetId?.trim())
      .filter((id): id is string => Boolean(id));
    return {
      outboundCompleted,
      returnCompleted,
      scannedAssetIds,
      unitCount: units.length,
    };
  },
});

/**
 * Test-only: open damage report for triage UI (skips wizard photo/scan).
 */
export const seedOpenDamageReport = mutation({
  args: {
    assetId: v.optional(v.string()),
    reportedByUserId: v.optional(v.string()),
  },
  returns: v.object({
    reportId: v.id("damageReports"),
    inventoryItemId: v.id("inventoryItems"),
    assetId: v.string(),
    typeId: v.id("inventoryTypes"),
    /** Comment-thread subject id for `comments` with `subjectType: "damage_batch"`. */
    batchId: v.string(),
    queuePath: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const assetId = args.assetId?.trim() || `E2E-DMG-${String(now).slice(-6)}`;
    const typeId = await ctx.db.insert("inventoryTypes", {
      name: `E2E Damaged ${now}`,
      category: "misc",
      model: "E2E-DMG-1",
      manualUrls: [],
      capabilities: [],
      createdAt: now,
      updatedAt: now,
    });
    const inventoryItemId = await ctx.db.insert("inventoryItems", {
      assetId,
      typeId,
      status: "needs_repair",
      createdAt: now,
      updatedAt: now,
    });
    const batchId = crypto.randomUUID();
    const reportId = await ctx.db.insert("damageReports", {
      inventoryItemId,
      assetId,
      typeId,
      batchId,
      scope: "this_only",
      scopedItemIds: [inventoryItemId],
      operability: "needs_repair",
      severity: 3,
      notes: "E2E seeded damage",
      status: "open",
      reportedByUserId: args.reportedByUserId?.trim() || "e2e-reporter",
      reportedAt: now,
      updatedAt: now,
    });
    return {
      reportId,
      inventoryItemId,
      assetId,
      typeId,
      batchId,
      queuePath: "/dashboard/inventory/damage",
    };
  },
});

export const getDamageReportState = query({
  args: { reportId: v.id("damageReports") },
  returns: v.union(
    v.null(),
    v.object({
      status: v.string(),
      assetId: v.optional(v.string()),
      severity: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;
    return {
      status: report.status,
      assetId: report.assetId,
      severity: report.severity,
    };
  },
});

/**
 * Test-only: band payee user with active band org for e-sign flows.
 */
export const ensureBandPayeeUser = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
    bandName: v.optional(v.string()),
    /** Override to get a band org isolated from the shared e-sign fixture. */
    orgSlug: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.literal(true),
    email: v.string(),
    userId: v.string(),
    organizationId: v.string(),
    bandName: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const name = (args.name ?? "E2E Band Payee").trim() || "E2E Band Payee";
    const bandName = (args.bandName ?? "E2E Test Band").trim() || "E2E Test Band";
    if (!email) throw new Error("Email is required.");
    if (args.password.length < 8) throw new Error("Password must be at least 8 characters.");

    const now = Date.now();
    const existingUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    });

    let userId = getId(existingUser);
    if (!existingUser) {
      const createdUser = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "user",
          data: {
            name,
            email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
            role: "user",
          },
        },
      });
      userId = getId(createdUser);
    } else {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "user",
          where: [{ field: "email", value: email }],
          update: { name, updatedAt: now, emailVerified: true },
        },
      });
    }
    if (!userId) throw new Error("Unable to resolve e2e band user id.");

    const passwordHash = await hashPassword(args.password);
    const existingCredentialAccount = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [
        { field: "providerId", value: "credential" },
        { connector: "AND", field: "accountId", value: email },
      ],
    });
    if (!existingCredentialAccount) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "account",
          data: {
            accountId: email,
            providerId: "credential",
            userId,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          },
        },
      });
    } else {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "account",
          where: [
            { field: "providerId", value: "credential" },
            { connector: "AND", field: "accountId", value: email },
          ],
          update: { password: passwordHash, updatedAt: now },
        },
      });
    }

    const slug = args.orgSlug?.trim() || "e2e-test-band";
    const existingOrg = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "organization",
      where: [{ field: "slug", value: slug }],
    });
    let organizationId = getId(existingOrg);
    if (!organizationId) {
      const createdOrg = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "organization",
          data: { name: bandName, slug, createdAt: now },
        },
      });
      organizationId = getId(createdOrg);
    }
    if (!organizationId) throw new Error("Unable to resolve e2e band organization.");

    const existingMember = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "member",
      where: [
        { field: "organizationId", value: organizationId },
        { connector: "AND", field: "userId", value: userId },
      ],
    });
    if (!existingMember) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "member",
          data: {
            organizationId,
            userId,
            role: "owner",
            createdAt: now,
          },
        },
      });
    }

    const existingAppMembership = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", userId!).eq("organizationId", organizationId!),
      )
      .unique();
    if (existingAppMembership) {
      await ctx.db.patch(existingAppMembership._id, {
        role: "owner",
        active: true,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userOrganizationMemberships", {
        userId,
        organizationId,
        role: "owner",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingOrgProfile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId!))
      .unique();
    const payeePatch = {
      organizationType: "band" as const,
      displayName: bandName,
      designatedPayeeUserId: userId,
      designatedPayeeName: name,
      designatedPayeeEmail: email,
      designatedPayeeMailingAddress: "450 Serra Mall, Stanford, CA 94305",
      designatedPayeePayoutMethod: "pickup" as const,
      updatedAt: now,
    };
    if (existingOrgProfile) {
      await ctx.db.patch(existingOrgProfile._id, payeePatch);
    } else {
      await ctx.db.insert("organizationProfiles", {
        organizationId,
        ...payeePatch,
      });
    }

    const existingActiveOrg = await ctx.db
      .query("userActiveOrganizations")
      .withIndex("by_userId", (q) => q.eq("userId", userId!))
      .unique();
    if (existingActiveOrg) {
      await ctx.db.patch(existingActiveOrg._id, {
        organizationId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userActiveOrganizations", {
        userId,
        organizationId,
        updatedAt: now,
      });
    }

    const existingOnboarding = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId!))
      .unique();
    if (existingOnboarding) {
      await ctx.db.patch(existingOnboarding._id, {
        status: "waived",
        waivedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("organizationOnboarding", {
        organizationId,
        status: "waived",
        waivedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { ok: true as const, email, userId, organizationId, bandName };
  },
});

/**
 * Test-only: technical rider for a band org (admin or band self-service fixtures).
 */
export const seedBandRider = mutation({
  args: {
    organizationId: v.string(),
    name: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
    isDefault: v.optional(v.boolean()),
  },
  returns: v.object({
    riderId: v.id("bandRiders"),
    name: v.string(),
    status: v.string(),
    isDefault: v.boolean(),
    organizationId: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const name = args.name?.trim() || `E2E Rider ${now}`;
    const status = args.status ?? "published";
    const isDefault = args.isDefault ?? true;

    if (isDefault) {
      const existingDefaults = await ctx.db
        .query("bandRiders")
        .withIndex("by_organizationId_and_isDefault", (q) =>
          q.eq("organizationId", args.organizationId).eq("isDefault", true),
        )
        .take(50);
      for (const rider of existingDefaults) {
        await ctx.db.patch(rider._id, { isDefault: false });
      }
    }

    const riderId = await ctx.db.insert("bandRiders", {
      organizationId: args.organizationId,
      name,
      status,
      isDefault,
      stage: { widthFt: 24, depthFt: 12 },
      items: [
        {
          id: `e2e-item-${now}`,
          symbol: "vocal_mic",
          label: "Lead Vocal",
          xFt: 12,
          yFt: 8,
          rotation: 0,
          scale: 1,
        },
      ],
      inputs: [
        {
          id: `e2e-in-${now}`,
          channel: 1,
          source: "Lead Vocal",
          inputType: "mic",
          stand: "tall_boom",
          phantom: false,
          providedBy: "arbor",
          stageItemId: `e2e-item-${now}`,
        },
      ],
      monitorMixes: [
        {
          id: `e2e-mix-${now}`,
          mixNumber: 1,
          label: "Vocals",
          type: "wedge",
          sends: 1,
        },
      ],
      backline: [],
      performerCount: 1,
      setLengthMinutes: 45,
      createdByUserId: "e2e-helpers",
      updatedByUserId: "e2e-helpers",
      createdAt: now,
      updatedAt: now,
    });

    return {
      riderId,
      name,
      status,
      isDefault,
      organizationId: args.organizationId,
    };
  },
});

/**
 * Test-only: event with a linked band and that band's default rider.
 */
export const seedEventWithBandRider = mutation({
  args: {
    organizationId: v.string(),
    eventTitle: v.optional(v.string()),
    riderName: v.optional(v.string()),
  },
  returns: v.object({
    eventId: v.id("events"),
    riderId: v.id("bandRiders"),
    eventTitle: v.string(),
    riderName: v.string(),
    organizationId: v.string(),
    eventPath: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const eventTitle = args.eventTitle?.trim() || `E2E Rider Event ${now}`;
    const endAt = now + 4 * 60 * 60 * 1000;
    const startAt = now + 60 * 60 * 1000;

    const eventId = await ctx.db.insert("events", {
      title: eventTitle,
      status: "ready",
      visibility: "internal",
      publicToken: makeToken(),
      startAt,
      endAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      eventType: "Crewed Event",
      teamsInterested: [],
      venueName: "E2E Stage",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("eventBandParticipations", {
      eventId,
      organizationId: args.organizationId,
      role: "headliner",
      createdAt: now,
      updatedAt: now,
    });

    const riderName = args.riderName?.trim() || `E2E Rider ${now}`;
    const existingDefaults = await ctx.db
      .query("bandRiders")
      .withIndex("by_organizationId_and_isDefault", (q) =>
        q.eq("organizationId", args.organizationId).eq("isDefault", true),
      )
      .take(50);
    for (const rider of existingDefaults) {
      await ctx.db.patch(rider._id, { isDefault: false });
    }

    const riderId = await ctx.db.insert("bandRiders", {
      organizationId: args.organizationId,
      name: riderName,
      status: "published",
      isDefault: true,
      stage: { widthFt: 24, depthFt: 12 },
      items: [
        {
          id: `e2e-item-${now}`,
          symbol: "vocal_mic",
          label: "Lead Vocal",
          xFt: 12,
          yFt: 8,
          rotation: 0,
          scale: 1,
        },
      ],
      inputs: [
        {
          id: `e2e-in-${now}`,
          channel: 1,
          source: "Lead Vocal",
          inputType: "mic",
          stand: "tall_boom",
          phantom: false,
          providedBy: "arbor",
          stageItemId: `e2e-item-${now}`,
        },
      ],
      monitorMixes: [
        {
          id: `e2e-mix-${now}`,
          mixNumber: 1,
          label: "Vocals",
          type: "wedge",
          sends: 1,
        },
      ],
      backline: [],
      performerCount: 1,
      setLengthMinutes: 45,
      createdByUserId: "e2e-helpers",
      updatedByUserId: "e2e-helpers",
      createdAt: now,
      updatedAt: now,
    });

    return {
      eventId,
      riderId,
      eventTitle,
      riderName,
      organizationId: args.organizationId,
      eventPath: `/dashboard/events/${eventId}`,
    };
  },
});

/**
 * Test-only: ended event + band payment ready for signature-request / e-sign.
 */
export const seedBandPaymentForEsign = mutation({
  args: {
    organizationId: v.string(),
    payeeUserId: v.string(),
    payeeName: v.string(),
    payeeEmail: v.string(),
    status: v.optional(
      v.union(
        v.literal("pending_email"),
        v.literal("awaiting_confirmation"),
        v.literal("confirmed"),
      ),
    ),
    eventTitle: v.optional(v.string()),
  },
  returns: v.object({
    paymentId: v.id("eventBandPayments"),
    eventId: v.id("events"),
    confirmationToken: v.string(),
    status: v.string(),
    eventTitle: v.string(),
    adminPath: v.string(),
    bandPath: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const status = args.status ?? "pending_email";
    const eventTitle = args.eventTitle?.trim() || `E2E Band Pay ${now}`;
    const endAt = now - 2 * 24 * 60 * 60 * 1000;
    const startAt = endAt - 4 * 60 * 60 * 1000;
    const eventId = await ctx.db.insert("events", {
      title: eventTitle,
      status: "ready",
      visibility: "internal",
      publicToken: makeToken(),
      startAt,
      endAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      eventType: "Crewed Event",
      teamsInterested: [],
      venueName: "E2E Stage",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("eventBandParticipations", {
      eventId,
      organizationId: args.organizationId,
      role: "headliner",
      createdAt: now,
      updatedAt: now,
    });
    const confirmationToken = await allocateBandPaymentConfirmationToken(ctx);
    const paymentId = await ctx.db.insert("eventBandPayments", {
      eventId,
      organizationId: args.organizationId,
      pricingMode: "fixed_total",
      totalUsd: 250,
      designatedPayeeUserId: args.payeeUserId,
      designatedPayeeName: args.payeeName.trim(),
      designatedPayeeEmail: args.payeeEmail.trim().toLowerCase(),
      designatedPayeeMailingAddress: "450 Serra Mall, Stanford, CA 94305",
      designatedPayeePayoutMethod: "pickup" as const,
      status,
      confirmationToken,
      confirmationEmailSentAt: status === "pending_email" ? undefined : now - 60_000,
      confirmationSentByUserId: status === "pending_email" ? undefined : "e2e-manager",
      confirmationSentByName: status === "pending_email" ? undefined : "E2E Admin",
      confirmationSentByEmail:
        status === "pending_email" ? undefined : "e2e-admin@arborlive.test",
      confirmedAt: status === "confirmed" ? now - 30_000 : undefined,
      signatureTypedName: status === "confirmed" ? args.payeeName.trim() : undefined,
      createdAt: now,
      updatedAt: now,
    });
    return {
      paymentId,
      eventId,
      confirmationToken,
      status,
      eventTitle,
      adminPath: "/dashboard/financial-hub/band-payouts",
      bandPath: "/dashboard/bands-and-performers/payments",
    };
  },
});

/**
 * Test-only: upcoming event with optional band participation (no assignment email —
 * inserts participation directly). Use for band-home show list coverage.
 */
export const seedUpcomingBandShow = mutation({
  args: {
    organizationId: v.optional(v.string()),
    eventTitle: v.optional(v.string()),
    role: v.optional(
      v.union(v.literal("headliner"), v.literal("support"), v.literal("other")),
    ),
  },
  returns: v.object({
    eventId: v.id("events"),
    eventTitle: v.string(),
    eventPath: v.string(),
    organizationId: v.union(v.string(), v.null()),
    linked: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const eventTitle = args.eventTitle?.trim() || `E2E Upcoming Show ${now}`;
    const startAt = now + 2 * 60 * 60 * 1000;
    const endAt = startAt + 3 * 60 * 60 * 1000;
    const eventId = await ctx.db.insert("events", {
      title: eventTitle,
      status: "ready",
      visibility: "internal",
      publicToken: makeToken(),
      startAt,
      endAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      eventType: "Crewed Event",
      teamsInterested: [],
      venueName: "E2E Stage",
      createdAt: now,
      updatedAt: now,
    });

    const organizationId = args.organizationId?.trim() || null;
    if (organizationId) {
      await ctx.db.insert("eventBandParticipations", {
        eventId,
        organizationId,
        role: args.role ?? "headliner",
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      eventId,
      eventTitle,
      eventPath: `/dashboard/events/${eventId}`,
      organizationId,
      linked: Boolean(organizationId),
    };
  },
});

export const getBandPaymentState = query({
  args: { paymentId: v.id("eventBandPayments") },
  returns: v.union(
    v.null(),
    v.object({
      status: v.string(),
      confirmationToken: v.string(),
      servicePaymentNumber: v.union(v.string(), v.null()),
      signatureTypedName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return null;
    return {
      status: payment.status,
      confirmationToken: payment.confirmationToken,
      servicePaymentNumber: payment.servicePaymentNumber ?? null,
      signatureTypedName: payment.signatureTypedName ?? null,
    };
  },
});

/**
 * Test-only: mark a confirmed band payment paid without the heavy payouts queue UI.
 */
export const markBandPaymentPaid = mutation({
  args: {
    paymentId: v.id("eventBandPayments"),
    servicePaymentNumber: v.string(),
  },
  returns: v.object({
    status: v.literal("paid"),
    servicePaymentNumber: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Band payment not found.");
    if (payment.status !== "confirmed") {
      throw new Error(`Expected confirmed payment, got ${payment.status}.`);
    }
    const servicePaymentNumber = args.servicePaymentNumber.trim();
    if (!servicePaymentNumber) throw new Error("Service payment number is required.");
    const now = Date.now();
    await ctx.db.patch(payment._id, {
      status: "paid",
      servicePaymentNumber,
      paidAt: now,
      paidByUserId: "e2e-manager",
      paidByName: "E2E Admin",
      paidByEmail: "e2e-admin@arborlive.test",
      bandNotifiedAt: now,
      updatedAt: now,
    });
    return { status: "paid" as const, servicePaymentNumber };
  },
});

export const getLatestCrewApplicationByEmail = query({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      applicationId: v.id("crewApplications"),
      status: v.string(),
      name: v.string(),
      email: v.string(),
      vertical: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const rows = await ctx.db.query("crewApplications").order("desc").take(50);
    const match = rows.find((row) => row.email === email);
    if (!match) return null;
    return {
      applicationId: match._id,
      status: match.status,
      name: match.name,
      email: match.email,
      vertical: match.vertical,
    };
  },
});

/**
 * Test-only: latest booking request for a Stanford email (public wizard submit).
 */
export const getLatestBookingRequestByEmail = query({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      requestId: v.id("eventRequests"),
      status: v.string(),
      requestNumber: v.union(v.string(), v.null()),
      publicToken: v.union(v.string(), v.null()),
      eventName: v.union(v.string(), v.null()),
      email: v.string(),
      path: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const rows = await ctx.db
      .query("eventRequests")
      .withIndex("by_email", (q) => q.eq("email", email))
      .order("desc")
      .take(20);
    const match = rows[0];
    if (!match) return null;
    return {
      requestId: match._id,
      status: match.status,
      requestNumber: match.requestNumber ?? null,
      publicToken: match.publicToken ?? null,
      eventName: match.eventName ?? null,
      email: match.email,
      path: `/dashboard/events/requests/${match._id}`,
    };
  },
});

/**
 * Test-only: invoice editor / payment state by id.
 */
export const getInvoiceEditorState = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.union(
    v.null(),
    v.object({
      invoiceId: v.id("invoices"),
      invoiceNumber: v.string(),
      status: v.string(),
      publicApprovalToken: v.union(v.string(), v.null()),
      publicPath: v.union(v.string(), v.null()),
      paymentReceivedAt: v.union(v.number(), v.null()),
      clientApprovalStatus: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    const token = invoice.publicApprovalToken ?? null;
    return {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      publicApprovalToken: token,
      publicPath: token ? `/event/${token}` : null,
      paymentReceivedAt: invoice.paymentReceivedAt ?? null,
      clientApprovalStatus: invoice.clientApprovalStatus ?? null,
    };
  },
});

/**
 * Test-only: latest band application by contact email.
 */
export const getLatestBandApplicationByEmail = query({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      applicationId: v.id("bandApplications"),
      status: v.string(),
      contactName: v.string(),
      contactEmail: v.string(),
      bandDisplayName: v.string(),
      organizationId: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const rows = await ctx.db
      .query("bandApplications")
      .withIndex("by_contactEmail", (q) => q.eq("contactEmail", email))
      .order("desc")
      .take(20);
    const match = rows[0];
    if (!match) return null;
    return {
      applicationId: match._id,
      status: match.status,
      contactName: match.contactName,
      contactEmail: match.contactEmail,
      bandDisplayName: match.bandDisplayName,
      organizationId: match.organizationId ?? null,
    };
  },
});

/**
 * Test-only: event venue linkage after VenuePicker save.
 */
export const getEventVenueState = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({
      eventId: v.id("events"),
      title: v.string(),
      venueId: v.union(v.id("venues"), v.null()),
      venueName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    return {
      eventId: event._id,
      title: event.title,
      venueId: event.venueId ?? null,
      venueName: event.venueName ?? null,
    };
  },
});

/**
 * Test-only: resolve venue by exact name (most recent).
 */
export const getLatestVenueByName = query({
  args: { name: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      venueId: v.id("venues"),
      name: v.string(),
      path: v.string(),
      kind: v.string(),
      venueType: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const name = args.name.trim();
    const rows = await ctx.db.query("venues").order("desc").take(100);
    const match = rows.find((row) => row.name === name);
    if (!match) return null;
    return {
      venueId: match._id,
      name: match.name,
      path: match.path,
      kind: match.kind,
      venueType: match.venueType,
    };
  },
});

/**
 * Test-only: drop Better Auth JWKS so keys regenerate under the current secret.
 * Needed after accidental BETTER_AUTH_SECRET rotation against a shared deployment.
 */
export const clearAuthJwks = mutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    assertE2eHelpersEnabled();
    const rows = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "jwks",
      paginationOpts: { cursor: null, numItems: 100 },
    });
    const list = Array.isArray(rows)
      ? rows
      : Array.isArray((rows as { page?: unknown[] })?.page)
        ? ((rows as { page: unknown[] }).page ?? [])
        : [];
    let deleted = 0;
    for (const row of list) {
      const id = getId(row);
      if (!id) continue;
      await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: {
          model: "jwks",
          where: [{ field: "_id", value: id }],
        },
      });
      deleted += 1;
    }
    return { deleted };
  },
});

/* ------------------------------------------------------------------ *
 * Batch 4 — hiring completion (crew triage, crew/band onboarding)
 * ------------------------------------------------------------------ */

/**
 * Test-only: submitted crew application ready for admin triage
 * (trainee / convert / turn away) without driving the public apply form.
 */
export const seedSubmittedCrewApplication = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.object({
    applicationId: v.id("crewApplications"),
    name: v.string(),
    email: v.string(),
    queuePath: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const name = args.name?.trim() || `E2E Triage Applicant ${now}`;
    const email =
      args.email?.trim().toLowerCase() || `e2e.triage.${now}@stanford.edu`;

    const applicationId = await ctx.db.insert("crewApplications", {
      status: "submitted",
      name,
      email,
      phone: "6505550199",
      heardAboutUs: "E2E test suite",
      vertical: "Crew",
      discipline: "Sound",
      crewAvailabilityDays: ["friday"],
      stanfordPosition: "undergrad",
      gradYear: 2028,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return {
      applicationId,
      name,
      email,
      queuePath: "/dashboard/users/crew-applications",
    };
  },
});

/**
 * Test-only: crew application triage state (status + trainee shift + convert).
 */
export const getCrewApplicationState = query({
  args: { applicationId: v.id("crewApplications") },
  returns: v.union(
    v.null(),
    v.object({
      applicationId: v.id("crewApplications"),
      status: v.string(),
      name: v.string(),
      email: v.string(),
      reviewedAt: v.union(v.number(), v.null()),
      convertedUserId: v.union(v.string(), v.null()),
      traineeShiftCount: v.number(),
      traineeShiftEventIds: v.array(v.id("events")),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const application = await ctx.db.get(args.applicationId);
    if (!application) return null;
    const shifts = await ctx.db
      .query("eventCrewShifts")
      .withIndex("by_crewApplicationId", (q) =>
        q.eq("crewApplicationId", args.applicationId),
      )
      .take(50);
    return {
      applicationId: application._id,
      status: application.status,
      name: application.name,
      email: application.email,
      reviewedAt: application.reviewedAt ?? null,
      convertedUserId: application.convertedUserId ?? null,
      traineeShiftCount: shifts.length,
      traineeShiftEventIds: shifts.map((shift) => shift.eventId),
    };
  },
});

/**
 * Test-only: put a crew user's onboarding back to not_started so the wizard
 * runs from the top. `ensureCrewUser` waives onboarding for other specs.
 */
export const resetCrewOnboarding = mutation({
  args: { userId: v.string() },
  returns: v.object({ ok: v.literal(true), userId: v.string() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (row) {
      await ctx.db.patch(row._id, {
        status: "not_started",
        profileCompletedAt: undefined,
        whatsappAcknowledgedAt: undefined,
        instagramAcknowledgedAt: undefined,
        hasFederalWorkStudy: undefined,
        fwsAcknowledgedAt: undefined,
        narcanCompletedAt: undefined,
        soberMonitorCompletedAt: undefined,
        emergencySopsAcknowledgedAt: undefined,
        crewExpectationsAcknowledgedAt: undefined,
        liftingCompletedAt: undefined,
        hasValidDriversLicense: undefined,
        cartTrainingCompletedAt: undefined,
        oseHiringFormCompletedAt: undefined,
        timecardAcknowledgedAt: undefined,
        contractorPayAcknowledgedAt: undefined,
        agreedToOnboardingDocAt: undefined,
        signatureLegalName: undefined,
        signatureUserAgent: undefined,
        completedAt: undefined,
        waivedAt: undefined,
        waivedByUserId: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userOnboarding", {
        userId: args.userId,
        flow: "crew",
        status: "not_started",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Stanford path is what the Playwright wizard spec walks; keep it deterministic.
    const profile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (profile) {
      await ctx.db.patch(profile._id, {
        payrollMethod: "stanford",
        updatedAt: now,
      });
    }

    return { ok: true as const, userId: args.userId };
  },
});

/**
 * Test-only: crew onboarding completion state for wizard assertions.
 */
export const getCrewOnboardingState = query({
  args: { userId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.string(),
      status: v.string(),
      signatureLegalName: v.union(v.string(), v.null()),
      completedAt: v.union(v.number(), v.null()),
      hasFederalWorkStudy: v.union(v.boolean(), v.null()),
      timecardAcknowledged: v.boolean(),
      narcanCompleted: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!row) return null;
    return {
      userId: row.userId,
      status: row.status,
      signatureLegalName: row.signatureLegalName ?? null,
      completedAt: row.completedAt ?? null,
      hasFederalWorkStudy: row.hasFederalWorkStudy ?? null,
      timecardAcknowledged: Boolean(row.timecardAcknowledgedAt),
      narcanCompleted: Boolean(row.narcanCompletedAt),
    };
  },
});

/**
 * Test-only: put a band org's onboarding back to not_started and clear the
 * profile fields the wizard fills, so `/onboarding/band` runs from the top.
 */
export const resetBandOnboarding = mutation({
  args: { organizationId: v.string() },
  returns: v.object({ ok: v.literal(true), organizationId: v.string() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();

    const row = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, {
        status: "not_started",
        identityCompletedAt: undefined,
        heroCompletedAt: undefined,
        socialsCompletedAt: undefined,
        ratesPayeeCompletedAt: undefined,
        membersCompletedAt: undefined,
        paymentExplainedAt: undefined,
        soloAcknowledgedAt: undefined,
        completedAt: undefined,
        waivedAt: undefined,
        waivedByUserId: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("organizationOnboarding", {
        organizationId: args.organizationId,
        status: "not_started",
        createdAt: now,
        updatedAt: now,
      });
    }

    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (profile) {
      await ctx.db.patch(profile._id, {
        performerHourlyRateUsd: undefined,
        updatedAt: now,
      });
    }

    return { ok: true as const, organizationId: args.organizationId };
  },
});

/**
 * Test-only: band onboarding completion state plus the rate the wizard saved.
 */
export const getBandOnboardingState = query({
  args: { organizationId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      organizationId: v.string(),
      status: v.string(),
      identityCompleted: v.boolean(),
      ratesPayeeCompleted: v.boolean(),
      paymentExplained: v.boolean(),
      soloAcknowledged: v.boolean(),
      completedAt: v.union(v.number(), v.null()),
      displayName: v.union(v.string(), v.null()),
      performerHourlyRateUsd: v.union(v.number(), v.null()),
      designatedPayeeName: v.union(v.string(), v.null()),
      designatedPayeePayoutMethod: v.union(v.literal("pickup"), v.literal("delivery"), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const row = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (!row) return null;
    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    const payoutMethod = profile?.designatedPayeePayoutMethod;
    return {
      organizationId: row.organizationId,
      status: row.status,
      identityCompleted: Boolean(row.identityCompletedAt),
      ratesPayeeCompleted: Boolean(row.ratesPayeeCompletedAt),
      paymentExplained: Boolean(row.paymentExplainedAt),
      soloAcknowledged: Boolean(row.soloAcknowledgedAt),
      completedAt: row.completedAt ?? null,
      displayName: profile?.displayName ?? null,
      performerHourlyRateUsd: profile?.performerHourlyRateUsd ?? null,
      designatedPayeeName: profile?.designatedPayeeName ?? null,
      designatedPayeePayoutMethod:
        payoutMethod === "pickup" || payoutMethod === "delivery" ? payoutMethod : null,
    };
  },
});

/* ------------------------------------------------------------------ *
 * Batch 5 — ops depth (pull list, damage create, scheduling, series)
 * ------------------------------------------------------------------ */

/**
 * Test-only: persisted pull-list lines after the Equipment tab editor saves.
 */
export const getPullListState = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    lineCount: v.number(),
    totalPieces: v.number(),
    lines: v.array(
      v.object({
        id: v.id("eventPullListItems"),
        label: v.string(),
        lineKind: v.string(),
        quantityRequired: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const rows = await ctx.db
      .query("eventPullListItems")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);
    return {
      lineCount: rows.length,
      totalPieces: rows.reduce((sum, row) => sum + row.quantityRequired, 0),
      lines: rows.map((row) => ({
        id: row._id,
        label: row.label,
        lineKind: row.lineKind ?? (row.packageId ? "package" : "type"),
        quantityRequired: row.quantityRequired,
      })),
    };
  },
});

/**
 * Test-only: newest damage report for an asset tag (damage wizard create).
 */
export const getLatestDamageReportByAssetId = query({
  args: { assetId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      reportId: v.id("damageReports"),
      status: v.string(),
      assetId: v.string(),
      severity: v.union(v.number(), v.null()),
      operability: v.union(v.string(), v.null()),
      notes: v.union(v.string(), v.null()),
      eventId: v.union(v.id("events"), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const assetId = args.assetId.trim();
    const item = await ctx.db
      .query("inventoryItems")
      .withIndex("by_assetId", (q) => q.eq("assetId", assetId))
      .unique();
    if (!item) return null;
    const rows = await ctx.db
      .query("damageReports")
      .withIndex("by_inventoryItemId", (q) => q.eq("inventoryItemId", item._id))
      .order("desc")
      .take(20);
    const match = rows[0];
    if (!match) return null;
    return {
      reportId: match._id,
      status: match.status,
      assetId,
      severity: match.severity ?? null,
      operability: match.operability ?? null,
      notes: match.notes ?? null,
      eventId: match.eventId ?? null,
    };
  },
});

/**
 * Test-only: read a band organization profile by org display name.
 */
export const getBandOrganizationProfileByDisplayName = query({
  args: { displayName: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      organizationId: v.string(),
      displayName: v.optional(v.string()),
      bio: v.optional(v.string()),
      performerHourlyRateUsd: v.optional(v.number()),
      publicListing: v.optional(v.boolean()),
      publicSlug: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const org = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_displayName", (q) => q.eq("displayName", args.displayName))
      .first();
    if (!org) return null;
    return {
      organizationId: org.organizationId,
      displayName: org.displayName,
      bio: org.bio,
      performerHourlyRateUsd: org.performerHourlyRateUsd,
      publicListing: org.publicListing,
      publicSlug: org.publicSlug,
    };
  },
});

/**
 * Test-only: read a band organization profile by org id.
 */
export const getBandOrganizationProfileByOrgId = query({
  args: { organizationId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      organizationId: v.string(),
      displayName: v.optional(v.string()),
      bio: v.optional(v.string()),
      performerHourlyRateUsd: v.optional(v.number()),
      publicListing: v.optional(v.boolean()),
      publicSlug: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const org = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (!org) return null;
    return {
      organizationId: org.organizationId,
      displayName: org.displayName,
      bio: org.bio,
      performerHourlyRateUsd: org.performerHourlyRateUsd,
      publicListing: org.publicListing,
      publicSlug: org.publicSlug,
    };
  },
});

/**
 * Test-only: count of schedule blocks for a given event.
 */
export const getEventScheduleBlockCount = query({
  args: { eventId: v.id("events") },
  returns: v.object({ count: v.number() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();
    return { count: blocks.length };
  },
});

/**
 * Test-only: schedule block info (type + label per block) for a given event.
 */
export const getOccurrenceScheduleBlocks = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({ blockType: v.string(), label: v.string() }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const blocks = await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();
    return blocks.map((b) => ({ blockType: b.blockType, label: b.label }));
  },
});

/**
 * Test-only: series shape behind an occurrence event (recurring create).
 */
export const getEventSeriesStateByEventId = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({
      seriesId: v.id("eventSeries"),
      title: v.string(),
      intervalWeeks: v.number(),
      occurrenceCount: v.number(),
      occurrenceTitles: v.array(v.string()),
      occurrenceIds: v.array(v.id("events")),
      seriesPath: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const event = await ctx.db.get(args.eventId);
    if (!event?.seriesId) return null;
    const series = await ctx.db.get(event.seriesId);
    if (!series) return null;
    const occurrences = await ctx.db
      .query("events")
      .withIndex("by_seriesId_and_occurrenceIndex", (q) => q.eq("seriesId", series._id))
      .take(100);
    return {
      seriesId: series._id,
      title: series.title,
      intervalWeeks: series.intervalWeeks,
      occurrenceCount: occurrences.length,
      occurrenceTitles: occurrences.map((row) => row.title),
      occurrenceIds: occurrences.map((row) => row._id),
      seriesPath: `/dashboard/events/series/${series._id}`,
    };
  },
});

/* ------------------------------------------------------------------ *
 * Batch 6 — secondary surfaces (timecards, short links, public pages)
 * ------------------------------------------------------------------ */

/**
 * Test-only: a finished crew shift inside the current pay period, so it shows
 * on `/dashboard/timecards/mine` and the admin overview. Timecards are derived
 * from `eventCrewShifts` — there is no timecard row to seed directly.
 */
export const seedTimecardShift = mutation({
  args: {
    userId: v.string(),
    title: v.optional(v.string()),
  },
  returns: v.object({
    eventId: v.id("events"),
    shiftId: v.id("eventCrewShifts"),
    title: v.string(),
    hours: v.number(),
    periodLabel: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const title = args.title?.trim() || `E2E Timecard Event ${now}`;
    const period = payPeriodForDate(now);

    // Keep the whole shift inside the current period so both the crew view and
    // the admin overview (which defaults to period index 0) pick it up.
    const endsAt = Math.min(now - 60_000, period.endMs - 60_000);
    const startsAt = Math.max(endsAt - 3 * 60 * 60 * 1000, period.startMs + 60_000);
    const hours = Math.max(0, (endsAt - startsAt) / (60 * 60 * 1000));

    const eventId = await ctx.db.insert("events", {
      title,
      status: "completed",
      visibility: "internal",
      publicToken: makeToken(),
      startAt: startsAt,
      endAt: endsAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      createdAt: now,
      updatedAt: now,
    });

    const shiftId = await ctx.db.insert("eventCrewShifts", {
      eventId,
      role: "Sound",
      userId: args.userId,
      startsAt,
      endsAt,
      hours,
      postedToExpense: false,
      createdAt: now,
      updatedAt: now,
    });

    return { eventId, shiftId, title, hours, periodLabel: period.label };
  },
});

/**
 * Test-only: short link lookup by slug for CRUD assertions.
 */
export const getShortLinkBySlug = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      shortLinkId: v.id("shortLinks"),
      slug: v.string(),
      destinationUrl: v.string(),
      label: v.union(v.string(), v.null()),
      enabled: v.boolean(),
      expiryMode: v.string(),
      clickCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const slug = args.slug.trim().toLowerCase();
    const match = await ctx.db
      .query("shortLinks")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!match) return null;
    return {
      shortLinkId: match._id,
      slug: match.slug,
      destinationUrl: match.destinationUrl,
      label: match.label ?? null,
      enabled: match.enabled,
      expiryMode: match.expiryMode,
      clickCount: match.clickCount,
    };
  },
});

/**
 * Test-only: standalone inventory item with an asset tag for the public
 * lost-and-found page at `/e/{assetId}`.
 */
export const seedLostFoundAsset = mutation({
  args: { assetId: v.optional(v.string()) },
  returns: v.object({
    inventoryItemId: v.id("inventoryItems"),
    typeId: v.id("inventoryTypes"),
    assetId: v.string(),
    typeName: v.string(),
    publicPath: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const assetId = args.assetId?.trim() || `E2E-LF-${String(now).slice(-6)}`;
    const typeName = `E2E Lost Found Type ${now}`;

    const typeId = await ctx.db.insert("inventoryTypes", {
      name: typeName,
      category: "misc",
      model: "E2E-LF-1",
      manualUrls: [],
      capabilities: [],
      createdAt: now,
      updatedAt: now,
    });
    const inventoryItemId = await ctx.db.insert("inventoryItems", {
      assetId,
      typeId,
      status: "functional",
      createdAt: now,
      updatedAt: now,
    });

    return {
      inventoryItemId,
      typeId,
      assetId,
      typeName,
      publicPath: `/e/${assetId}`,
    };
  },
});

/**
 * Test-only: delete events seeded by the e2e suite, plus everything hanging off
 * them.
 *
 * Seeded events cluster on identical `startAt` values, and several product
 * queries page with `.take(150)`/`.take(200)`. Once enough runs accumulate, the
 * newest seeded event sorts past the cap and specs start failing on a shared
 * deployment for reasons that have nothing to do with the code under test.
 *
 * Only touches rows whose event title starts with the e2e prefix, and only ones
 * older than `olderThanHours` so a concurrently running suite is left alone.
 */
export const pruneE2eSeedData = mutation({
  args: {
    olderThanHours: v.optional(v.number()),
    limit: v.optional(v.number()),
    /** Report what would be deleted without deleting it. */
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    scannedEvents: v.number(),
    matchedEvents: v.number(),
    deletedEvents: v.number(),
    deletedRequests: v.number(),
    deletedChildren: v.number(),
    dryRun: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const olderThanHours = args.olderThanHours ?? 2;
    const limit = Math.min(args.limit ?? 200, 500);
    const dryRun = args.dryRun ?? false;
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;

    const candidates = await ctx.db.query("events").withIndex("by_createdAt").take(2000);
    const doomed = candidates
      .filter((event) => event.title.startsWith("E2E ") && event.createdAt < cutoff)
      .slice(0, limit);

    if (dryRun) {
      return {
        scannedEvents: candidates.length,
        matchedEvents: doomed.length,
        deletedEvents: 0,
        deletedRequests: 0,
        deletedChildren: 0,
        dryRun: true,
      };
    }

    let deletedChildren = 0;
    for (const event of doomed) {
      // Unrolled rather than looped over a table-name array: Convex cannot infer
      // a shared `by_eventId` index across a union of table names.
      for (const row of await ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("eventCrewAvailabilityResponses")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("eventPeopleAssignments")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("eventPullListItems")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("eventArtifacts")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("eventExpenseReports")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("eventBandParticipations")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("eventBandPayments")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("eventRentalFulfillments")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("eventRentalUnits")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("eventPaymentProofSubmissions")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("eventMarketingDesigns")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }
      for (const row of await ctx.db
        .query("damageReports")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(500)) {
        await ctx.db.delete(row._id);
        deletedChildren += 1;
      }

      await ctx.db.delete(event._id);
    }

    // Prune stale E2E booking requests. The event pass above deletes the events
    // a converted request spawned, but leaves the request and its draft invoice
    // orphaned — and `eventRequests.list` pages with `.take(100)`, so orphaned
    // requests eventually push freshly seeded ones out of the inbox the same way
    // accumulated events broke `crew-availability-assign`. Bounded smaller than
    // the event pass: each request cascades into an invoice + event, so a pass
    // here is heavier per row.
    const requestRows = await ctx.db.query("eventRequests").order("asc").take(2000);
    const doomedRequests = requestRows
      .filter(
        (row) =>
          row.createdAt < cutoff &&
          (row.eventName?.startsWith("E2E ") ?? false) &&
          (row.status === "converted" || row.status === "declined"),
      )
      .slice(0, Math.min(limit, 25));
    let deletedRequests = 0;
    let deletedEventCount = doomed.length;
    for (const request of doomedRequests) {
      if (request.linkedInvoiceId) {
        const invoice = await ctx.db.get(request.linkedInvoiceId);
        if (invoice && (invoice.clientGroupName?.startsWith("E2E ") ?? false)) {
          await deleteInvoiceRecord(ctx, invoice._id);
          deletedChildren += 1;
        }
      }
      for (const event of await listEventsLinkedToRequest(ctx, request)) {
        await deleteEventRecord(ctx, event._id);
        deletedEventCount += 1;
        deletedChildren += 1;
      }
      await ctx.db.delete(request._id);
      deletedRequests += 1;
    }

    return {
      scannedEvents: candidates.length,
      matchedEvents: doomed.length,
      deletedEvents: deletedEventCount,
      deletedRequests,
      deletedChildren,
      dryRun: false,
    };
  },
});

/**
 * Test-only: prune stale stamped E2E users (invite-created accounts like
 * `e2e.crew.<ts>@arborlive.test`) so they never accumulate on a shared
 * deployment. Unlike the stable per-purpose accounts, these carry a timestamp
 * and were created by specs that must use a fresh identity (one-time invites);
 * if they pile up they pollute every name-keyed picker — the mention menu's
 * `extractMentionedUserIds` resolves a `@Name` token to *every* candidate with
 * that name, so two dozen "E2E Crew" members turn one mention into a
 * "You can mention at most 20 people" refusal.
 *
 * Stable accounts (`e2e-admin@`, `e2e-crew@`, `e2e-access-target@`, …) contain
 * no timestamp and are never touched.
 */
export const pruneStaleE2eUsers = mutation({
  args: {
    olderThanHours: v.optional(v.number()),
    limit: v.optional(v.number()),
    /** Report what would be deleted without deleting it. */
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    scannedUsers: v.number(),
    matchedUsers: v.number(),
    deletedUsers: v.number(),
    dryRun: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const olderThanHours = args.olderThanHours ?? 2;
    const limit = Math.min(args.limit ?? 50, 200);
    const dryRun = args.dryRun ?? false;
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;

    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: { cursor: null, numItems: 2000 },
    });
    const users = (result?.page ?? []) as Array<{
      id?: string;
      _id?: string;
      email?: string;
      name?: string | null;
      createdAt?: number;
    }>;

    const stamped = users.filter((user) => {
      const email = (user.email ?? "").toLowerCase();
      if (!/^e2e\.[a-z0-9.]+\.\d{9,}@(?:arborlive\.test|stanford\.edu)$/.test(email)) return false;
      return (user.createdAt ?? 0) < cutoff;
    });

    if (dryRun) {
      return {
        scannedUsers: users.length,
        matchedUsers: stamped.length,
        deletedUsers: 0,
        dryRun: true,
      };
    }

    // Unrolled rather than looped over a table-name array: Convex cannot infer
    // a shared `by_userId` index across a union of table names.
    const deleteByUserId = async (userId: string) => {
      for (const row of await ctx.db.query("userCompensationRates").withIndex("by_userId", (q) => q.eq("userId", userId)).take(500)) {
        await ctx.db.delete(row._id);
      }
      for (const row of await ctx.db.query("userAdminProfiles").withIndex("by_userId", (q) => q.eq("userId", userId)).take(500)) {
        await ctx.db.delete(row._id);
      }
      for (const row of await ctx.db.query("userOrganizationMemberships").withIndex("by_userId", (q) => q.eq("userId", userId)).take(500)) {
        await ctx.db.delete(row._id);
      }
      for (const row of await ctx.db.query("userActiveOrganizations").withIndex("by_userId", (q) => q.eq("userId", userId)).take(500)) {
        await ctx.db.delete(row._id);
      }
      for (const row of await ctx.db.query("userOnboarding").withIndex("by_userId", (q) => q.eq("userId", userId)).take(500)) {
        await ctx.db.delete(row._id);
      }
      for (const row of await ctx.db.query("dashboardPreferences").withIndex("by_userId", (q) => q.eq("userId", userId)).take(500)) {
        await ctx.db.delete(row._id);
      }
      for (const row of await ctx.db.query("eventCrewShifts").withIndex("by_userId_and_startsAt", (q) => q.eq("userId", userId)).take(500)) {
        await ctx.db.delete(row._id);
      }
      for (const row of await ctx.db.query("eventCrewMediaStatus").withIndex("by_userId", (q) => q.eq("userId", userId)).take(500)) {
        await ctx.db.delete(row._id);
      }
      for (const row of await ctx.db.query("eventCrewAvailabilityResponses").withIndex("by_userId", (q) => q.eq("userId", userId)).take(500)) {
        await ctx.db.delete(row._id);
      }
    };

    let deletedUsers = 0;
    for (const user of stamped.slice(0, limit)) {
      const userId = getId(user);
      if (!userId) continue;

      await deleteByUserId(userId);

      // Best-effort Better Auth cascade — never block the prune on it.
      for (const [model, field] of [
        ["account", "userId"],
        ["session", "userId"],
      ] as const) {
        await ctx
          .runMutation(components.betterAuth.adapter.deleteMany as any, {
            input: { model, where: [{ field, value: userId }] },
          })
          .catch(() => undefined);
      }
      await ctx
        .runMutation(components.betterAuth.adapter.deleteOne as any, {
          input: { model: "user", where: [{ field: "_id", value: userId }] },
        })
        .catch(() => undefined);
      deletedUsers += 1;
    }

    return {
      scannedUsers: users.length,
      matchedUsers: stamped.length,
      deletedUsers,
      dryRun: false,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Batch 8: invoice editor, billing entities, payment proof                    */
/* -------------------------------------------------------------------------- */

const e2eInvoiceLineValidator = v.object({
  section: v.string(),
  order: v.number(),
  label: v.string(),
  provider: v.union(v.string(), v.null()),
  quantity: v.number(),
  rateUsd: v.number(),
  amountUsd: v.number(),
  feeDefinitionId: v.union(v.id("invoiceFeeDefinitions"), v.null()),
});

/**
 * Test-only: server-side totals plus the persisted line items.
 *
 * The editor computes a draft total in the browser (`computeInvoiceDraftTotals`)
 * while the server recomputes independently in `invoices.computeTotals`. Specs
 * assert against this, not the DOM, so a divergence between the two shows up as
 * a failure instead of a passing test that only ever read one of them.
 */
export const getInvoiceTotalsState = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.union(
    v.null(),
    v.object({
      invoiceNumber: v.string(),
      status: v.string(),
      discountType: v.string(),
      discountValue: v.number(),
      discountAmountUsd: v.number(),
      discountWarning: v.union(v.string(), v.null()),
      equipmentSubtotalUsd: v.number(),
      externalRentalsSubtotalUsd: v.number(),
      artistsSubtotalUsd: v.number(),
      crewSubtotalUsd: v.number(),
      feesSubtotalUsd: v.number(),
      subtotalUsd: v.number(),
      totalUsd: v.number(),
      lineItems: v.array(e2eInvoiceLineValidator),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    const lines = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", args.invoiceId))
      .take(200);
    return {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      discountType: invoice.discountType,
      discountValue: invoice.discountValue,
      discountAmountUsd: invoice.discountAmountUsd,
      discountWarning: invoice.discountWarning ?? null,
      equipmentSubtotalUsd: invoice.equipmentSubtotalUsd,
      externalRentalsSubtotalUsd: invoice.externalRentalsSubtotalUsd,
      artistsSubtotalUsd: invoice.artistsSubtotalUsd,
      crewSubtotalUsd: invoice.crewSubtotalUsd,
      feesSubtotalUsd: invoice.feesSubtotalUsd,
      subtotalUsd: invoice.subtotalUsd,
      totalUsd: invoice.totalUsd,
      lineItems: lines
        .sort((a, b) => a.order - b.order)
        .map((line) => ({
          section: line.section,
          order: line.order,
          label: line.label,
          provider: line.provider ?? null,
          quantity: line.quantity,
          rateUsd: line.rateUsd,
          amountUsd: line.amountUsd,
          feeDefinitionId: line.feeDefinitionId ?? null,
        })),
    };
  },
});

/**
 * Test-only: comment threads for mention/notification regressions. Subject ids
 * are plain strings, so damage threads pass the report's `batchId`.
 */
export const getCommentsState = query({
  args: {
    subjectType: v.union(
      v.literal("event"),
      v.literal("damage_batch"),
      v.literal("event_request"),
    ),
    subjectId: v.string(),
  },
  returns: v.array(
    v.object({
      body: v.string(),
      authorUserId: v.string(),
      mentionedUserIds: v.array(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const rows = await ctx.db
      .query("comments")
      .withIndex("by_subject_and_createdAt", (q) =>
        q.eq("subjectType", args.subjectType).eq("subjectId", args.subjectId),
      )
      .order("asc")
      .take(100);
    return rows.map((row) => ({
      body: row.body,
      authorUserId: row.authorUserId,
      mentionedUserIds: row.mentionedUserIds,
      createdAt: row.createdAt,
    }));
  },
});

/**
 * Test-only: review/approval state for the two mutually exclusive editor cards.
 *
 * `invoice-editor.tsx` renders "Request portal" when `sourceEventRequestId` is
 * set and "Quote approval" otherwise, and the backend enforces the same split
 * (`markReadyForClientReview` and `regeneratePublicApprovalToken` each reject
 * the other kind). Specs read `isRequestLinked` to assert they seeded the shape
 * the flow under test actually requires.
 */
export const getInvoiceReviewState = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.union(
    v.null(),
    v.object({
      invoiceNumber: v.string(),
      status: v.string(),
      isRequestLinked: v.boolean(),
      clientReviewReadyAt: v.union(v.number(), v.null()),
      clientReadyMessage: v.union(v.string(), v.null()),
      clientApprovalStatus: v.union(v.string(), v.null()),
      clientApprovalSignedName: v.union(v.string(), v.null()),
      approvedAt: v.union(v.number(), v.null()),
      publicApprovalToken: v.union(v.string(), v.null()),
      requestTrackPath: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    const request = invoice.sourceEventRequestId
      ? await ctx.db.get(invoice.sourceEventRequestId)
      : null;
    return {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      isRequestLinked: Boolean(invoice.sourceEventRequestId),
      clientReviewReadyAt: invoice.clientReviewReadyAt ?? null,
      clientReadyMessage: invoice.clientReadyMessage ?? null,
      clientApprovalStatus: invoice.clientApprovalStatus ?? null,
      clientApprovalSignedName: invoice.clientApprovalSignedName ?? null,
      approvedAt: invoice.approvedAt ?? null,
      publicApprovalToken: invoice.publicApprovalToken ?? null,
      requestTrackPath: request ? `/request/track/${request.publicToken}` : null,
    };
  },
});

/**
 * Test-only: booking-request-linked quote that has NOT been sent for review yet.
 *
 * Deliberately separate from `seedBookingReadyForTrackApprove`, which seeds
 * `clientReviewReadyAt` already set and therefore renders "Withdraw". The
 * send-for-review spec needs to start from the "Ready for review" state.
 */
export const seedRequestLinkedDraftQuote = mutation({
  args: {
    eventName: v.optional(v.string()),
  },
  returns: v.object({
    requestId: v.id("eventRequests"),
    invoiceId: v.id("invoices"),
    eventId: v.id("events"),
    invoiceNumber: v.string(),
    requestNumber: v.string(),
    publicToken: v.string(),
    trackPath: v.string(),
    editorPath: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const seeded = await insertSubmittedBookingRequest(ctx, args.eventName);
    const invoiceNumber = `ALINV-${makeInvoiceSuffix()}`;
    const invoiceId = await ctx.db.insert("invoices", {
      invoiceNumber,
      status: "draft",
      issueDate: new Date(now).toISOString().slice(0, 10),
      managerUserId: "e2e-manager",
      managerName: "E2E Admin",
      managerEmail: "e2e-admin@arborlive.test",
      clientGroupName: seeded.eventName,
      clientContactName: "E2E Requester",
      clientEmail: "e2e.requester@stanford.edu",
      clientPhone: "6505550100",
      equipmentPricingMode: "nonSubsidized",
      crewRateMode: "normal",
      discountType: "amount",
      discountValue: 0,
      discountAmountUsd: 0,
      equipmentSubtotalUsd: 250,
      externalRentalsSubtotalUsd: 0,
      artistsSubtotalUsd: 0,
      crewSubtotalUsd: 0,
      feesSubtotalUsd: 0,
      subtotalUsd: 250,
      totalUsd: 250,
      clientApprovalStatus: "pending",
      sourceEventRequestId: seeded.requestId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("invoiceLineItems", {
      invoiceId,
      section: "equipment_type",
      order: 0,
      label: "E2E Request Quote Line",
      quantity: 1,
      rateUsd: 250,
      amountUsd: 250,
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await ctx.db.insert("events", {
      title: seeded.eventName,
      status: "tentative",
      visibility: "public",
      publicToken: makeToken(),
      startAt: seeded.startAt,
      endAt: seeded.endAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      venueName: "E2E Venue",
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      category: "Concert / Showcase",
      host: "E2E Test Org",
      expectedTurnout: 80,
      invoiceId,
      sourceEventRequestId: seeded.requestId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(seeded.requestId, {
      status: "converted",
      convertedEventId: eventId,
      convertedEventIds: [eventId],
      linkedInvoiceId: invoiceId,
      reviewedByUserId: "e2e-manager",
      updatedAt: now,
    });
    return {
      requestId: seeded.requestId,
      invoiceId,
      eventId,
      invoiceNumber,
      requestNumber: seeded.requestNumber,
      publicToken: seeded.publicToken,
      trackPath: `/request/track/${seeded.publicToken}`,
      editorPath: `/dashboard/financial-hub/invoices/${invoiceId}`,
    };
  },
});

/**
 * Test-only: approved quote + linked event + an ACTIVE payment proof submission.
 *
 * `financial-hub-payments-client.tsx` only renders "Invalidate proof" and
 * "Attach receipt" when `row.submission && !row.paymentReceivedAt`, and
 * `listByQueue` only surfaces invoices whose approval status is `approved` and
 * whose event is within the 90-day lookback — so all three have to be seeded
 * together for those buttons to exist at all.
 */
export const seedInvoiceWithProofSubmission = mutation({
  args: {
    clientGroupName: v.optional(v.string()),
  },
  returns: v.object({
    invoiceId: v.id("invoices"),
    eventId: v.id("events"),
    submissionId: v.id("eventPaymentProofSubmissions"),
    invoiceNumber: v.string(),
    paymentReference: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const { startAt, endAt } = futureEventWindow(10);
    const invoiceNumber = `ALINV-${makeInvoiceSuffix()}`;
    const paymentReference = `E2E-REF-${makeInvoiceSuffix()}`;
    const invoiceId = await ctx.db.insert("invoices", {
      invoiceNumber,
      status: "finalized",
      issueDate: new Date(now).toISOString().slice(0, 10),
      managerUserId: "e2e-manager",
      managerName: "E2E Admin",
      managerEmail: "e2e-admin@arborlive.test",
      clientGroupName: args.clientGroupName?.trim() || "E2E Proof Client",
      clientContactName: "E2E Contact",
      clientEmail: "e2e-client@example.com",
      equipmentPricingMode: "nonSubsidized",
      crewRateMode: "normal",
      discountType: "amount",
      discountValue: 0,
      discountAmountUsd: 0,
      equipmentSubtotalUsd: 400,
      externalRentalsSubtotalUsd: 0,
      artistsSubtotalUsd: 0,
      crewSubtotalUsd: 0,
      feesSubtotalUsd: 0,
      subtotalUsd: 400,
      totalUsd: 400,
      clientApprovalStatus: "approved",
      approvedAt: now - 60_000,
      clientApprovalSignedName: "E2E Signer",
      clientIsPaymentSubmitter: true,
      publicApprovalToken: makeToken(),
      publicApprovalTokenExpiresAt: now + 14 * 24 * 60 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("invoiceLineItems", {
      invoiceId,
      section: "equipment_type",
      order: 0,
      label: "E2E Proof Line",
      quantity: 1,
      rateUsd: 400,
      amountUsd: 400,
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await ctx.db.insert("events", {
      title: `E2E Proof Event ${now}`,
      status: "ready",
      visibility: "public",
      publicToken: makeToken(),
      invoiceId,
      startAt,
      endAt,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: true,
      eventType: "Crewed Event",
      teamsInterested: ["Sound"],
      createdAt: now,
      updatedAt: now,
    });
    const submissionId = await ctx.db.insert("eventPaymentProofSubmissions", {
      eventId,
      invoiceId,
      paymentMethod: "ijournal",
      paymentReference,
      financeContactEmail: "e2e-finance@example.com",
      status: "active",
      submittedAt: now,
      createdAt: now,
    });
    return { invoiceId, eventId, submissionId, invoiceNumber, paymentReference };
  },
});

/**
 * Test-only: payment proof submissions plus receipt state for one invoice.
 */
export const getPaymentProofState = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.object({
    hasReceipt: v.boolean(),
    paymentReceivedAt: v.union(v.number(), v.null()),
    submissions: v.array(
      v.object({
        submissionId: v.id("eventPaymentProofSubmissions"),
        status: v.union(v.string(), v.null()),
        paymentReference: v.string(),
        invalidationNote: v.union(v.string(), v.null()),
        invalidatedAt: v.union(v.number(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const invoice = await ctx.db.get(args.invoiceId);
    const submissions = await ctx.db
      .query("eventPaymentProofSubmissions")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", args.invoiceId))
      .take(20);
    return {
      hasReceipt: Boolean(invoice?.paymentReceiptStorageFileId),
      paymentReceivedAt: invoice?.paymentReceivedAt ?? null,
      submissions: submissions.map((row) => ({
        submissionId: row._id,
        status: row.status ?? null,
        paymentReference: row.paymentReference,
        invalidationNote: row.invalidationNote ?? null,
        invalidatedAt: row.invalidatedAt ?? null,
      })),
    };
  },
});

/**
 * Test-only: host org by exact name, with its linked contacts.
 *
 * Scoped by the name the spec seeded rather than "the newest group" — the
 * shared deployment accumulates rows across runs and across worktrees.
 */
export const getInvoiceGroupByName = query({
  args: { name: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      groupId: v.id("invoiceGroups"),
      name: v.string(),
      type: v.string(),
      active: v.boolean(),
      equipmentPricingMode: v.string(),
      contacts: v.array(
        v.object({
          contactId: v.id("invoiceContacts"),
          email: v.union(v.string(), v.null()),
          active: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const group = await ctx.db
      .query("invoiceGroups")
      .withIndex("by_name", (q) => q.eq("name", args.name.trim()))
      .first();
    if (!group) return null;
    const contacts = await ctx.db
      .query("invoiceContacts")
      .withIndex("by_groupId", (q) => q.eq("groupId", group._id))
      .take(100);
    return {
      groupId: group._id,
      name: group.name,
      type: group.type,
      active: group.active,
      equipmentPricingMode: group.equipmentPricingMode ?? "subsidized",
      contacts: contacts.map((row) => ({
        contactId: row._id,
        email: row.email ?? null,
        active: row.active,
      })),
    };
  },
});

/** Test-only: create a host org with normalizedName (for booking search specs). */
export const seedInvoiceGroup = mutation({
  args: {
    name: v.string(),
    type: v.optional(
      v.union(
        v.literal("vso"),
        v.literal("house"),
        v.literal("department"),
        v.literal("individual"),
      ),
    ),
    alias: v.optional(v.string()),
  },
  returns: v.id("invoiceGroups"),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const name = args.name.trim();
    const groupId = await ctx.db.insert("invoiceGroups", {
      name,
      normalizedName: name.trim().toLowerCase().replace(/\s+/g, " "),
      type: args.type ?? "department",
      equipmentPricingMode: "subsidized",
      active: true,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
    });
    const alias = args.alias?.trim();
    if (alias) {
      await ctx.db.insert("invoiceGroupAliases", {
        groupId,
        alias,
        normalizedAlias: alias.toLowerCase().replace(/\s+/g, " "),
        source: "manual",
        createdAt: now,
      });
    }
    return groupId;
  },
});

/**
 * Test-only: the billing identity denormalized onto an invoice.
 *
 * `invoices.createDraft` copies the selected host/contact into
 * `clientGroupName` / `clientContactName` alongside the `groupId` / `contactId`
 * references, so a spec that only checked the ids would miss the snapshot
 * fields the PDF and public quote page actually render.
 */
export const getInvoiceClientState = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.union(
    v.null(),
    v.object({
      hasGroupId: v.boolean(),
      hasContactId: v.boolean(),
      clientGroupName: v.union(v.string(), v.null()),
      clientGroupType: v.union(v.string(), v.null()),
      clientContactName: v.union(v.string(), v.null()),
      clientEmail: v.union(v.string(), v.null()),
      equipmentPricingMode: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    return {
      hasGroupId: Boolean(invoice.groupId),
      hasContactId: Boolean(invoice.contactId),
      clientGroupName: invoice.clientGroupName ?? null,
      clientGroupType: invoice.clientGroupType ?? null,
      clientContactName: invoice.clientContactName ?? null,
      clientEmail: invoice.clientEmail ?? null,
      equipmentPricingMode: invoice.equipmentPricingMode,
    };
  },
});

/* ------------------------------------------------------------------ *
 * Batch 9 — users, access, and rates
 * ------------------------------------------------------------------ */

async function findAuthOrganizationNames(ctx: QueryCtx | MutationCtx) {
  const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "organization",
    paginationOpts: { cursor: null, numItems: 200 },
  });
  const rows = (result?.page ?? []) as Array<{ id?: string; _id?: string; name?: string }>;
  const byId = new Map<string, string>();
  for (const row of rows) {
    const id = getId(row);
    if (id) byId.set(id, row.name ?? id);
  }
  return byId;
}

/**
 * Test-only: everything the Users admin table can change about one user.
 *
 * `authRole` is the field that actually decides admin-ness — `requireAdmin`
 * compares `user.role === "admin"` on the better-auth row, and the client
 * `AdminOnlyGuard` reads the same value through `getSessionShell`. The app-side
 * `userOrganizationMemberships.role` is a separate value that the Users row
 * writes at the same time, so both are returned: a spec that only checked one
 * could pass while the other never moved.
 */
export const getUserAdminStateByEmail = query({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.string(),
      name: v.string(),
      email: v.string(),
      authRole: v.string(),
      banned: v.boolean(),
      active: v.boolean(),
      title: v.string(),
      phone: v.string(),
      verticals: v.array(v.string()),
      disciplines: v.array(v.string()),
      defaultOrganizationId: v.string(),
      payrollMethod: v.string(),
      rateMode: v.union(v.string(), v.null()),
      storedHourlyRateUsd: v.union(v.number(), v.null()),
      effectiveHourlyRateUsd: v.union(v.number(), v.null()),
      memberships: v.array(
        v.object({
          organizationId: v.string(),
          organizationName: v.string(),
          role: v.string(),
          active: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    })) as {
      id?: string;
      _id?: string;
      name?: string;
      email?: string;
      role?: string;
      banned?: boolean;
    } | null;
    if (!user) return null;
    const userId = getId(user);
    if (!userId) return null;

    const profile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const membership = resolveProfileMembership(profile ?? {});
    const rate = await ctx.db
      .query("userCompensationRates")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const settings = await loadInvoiceCrewRateSettings(ctx);
    const orgNames = await findAuthOrganizationNames(ctx);
    const memberships = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(50);

    return {
      userId,
      name: user.name ?? "",
      email: user.email ?? email,
      authRole: user.role ?? "",
      banned: Boolean(user.banned),
      active: profile?.active ?? true,
      title: profile?.title ?? "",
      phone: profile?.phone ?? "",
      verticals: membership.verticals as string[],
      disciplines: membership.disciplines as string[],
      defaultOrganizationId: profile?.defaultOrganizationId ?? "",
      payrollMethod: normalizePayrollMethod(profile?.payrollMethod),
      rateMode: rate ? normalizeCompensationRateMode(rate.rateMode) : null,
      // The raw stored number. For a pinned (normal/lead) user this is 0 and the
      // effective rate comes from the global settings instead.
      storedHourlyRateUsd: rate ? rate.hourlyRateUsd : null,
      effectiveHourlyRateUsd: rate
        ? resolveUserCompensationHourlyRateUsd(rate, settings)
        : null,
      memberships: memberships.map((row) => ({
        organizationId: row.organizationId,
        organizationName: orgNames.get(row.organizationId) ?? row.organizationId,
        role: row.role,
        active: row.active,
      })),
    };
  },
});

/**
 * Test-only: the invitation for an email, plus the app-side pending row.
 *
 * The invite lives in two places — a better-auth `invitation` (status/role) and
 * a `pendingUserInvites` row (token, verticals, rate, payroll). Cancelling
 * deletes the second and only flips the status on the first, so `pending*`
 * fields are nullable rather than optional.
 */
export const getInvitationStateByEmail = query({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      invitationId: v.string(),
      email: v.string(),
      status: v.string(),
      role: v.string(),
      organizationId: v.string(),
      expiresAt: v.number(),
      pendingRole: v.union(v.string(), v.null()),
      pendingVerticals: v.array(v.string()),
      pendingDisciplines: v.array(v.string()),
      pendingRateMode: v.union(v.string(), v.null()),
      pendingCustomHourlyRateUsd: v.union(v.number(), v.null()),
      pendingPayrollMethod: v.union(v.string(), v.null()),
      hasPendingToken: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "invitation",
      paginationOpts: { cursor: null, numItems: 2000 },
    });
    const rows = (result?.page ?? []) as Array<{
      id?: string;
      _id?: string;
      email?: string;
      status?: string;
      role?: string;
      organizationId?: string;
      expiresAt?: number;
      createdAt?: number;
    }>;
    const matches = rows.filter((row) => (row.email ?? "").toLowerCase() === email);
    if (matches.length === 0) return null;
    const invite = matches.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
    const invitationId = getId(invite);
    if (!invitationId) return null;

    const pending = await ctx.db
      .query("pendingUserInvites")
      .withIndex("by_invitationId", (q) => q.eq("invitationId", invitationId))
      .unique();

    return {
      invitationId,
      email: invite.email ?? email,
      status: invite.status ?? "",
      role: invite.role ?? "",
      organizationId: invite.organizationId ?? "",
      expiresAt: invite.expiresAt ?? 0,
      pendingRole: pending?.role ?? null,
      pendingVerticals: (pending?.verticals ?? []) as string[],
      pendingDisciplines: (pending?.disciplines ?? []) as string[],
      pendingRateMode: pending?.rateMode ?? null,
      pendingCustomHourlyRateUsd: pending?.customHourlyRateUsd ?? null,
      pendingPayrollMethod: pending?.payrollMethod ?? null,
      hasPendingToken: Boolean(pending?.token),
    };
  },
});

/**
 * Test-only: read the global crew rates without writing them.
 *
 * `invoiceSettings.update` writes these globally, which on the shared e2e
 * deployment re-prices every other worktree's crew lines — so the rates spec
 * reads them here and asserts a pinned user resolves to them, instead of
 * setting them.
 */
export const getGlobalCrewRates = query({
  args: {},
  returns: v.object({
    normalRateUsd: v.number(),
    leadRateUsd: v.number(),
  }),
  handler: async (ctx) => {
    assertE2eHelpersEnabled();
    const settings = await loadInvoiceCrewRateSettings(ctx);
    return {
      normalRateUsd: Math.max(0, settings?.crewNormalRateUsd ?? 0),
      leadRateUsd: Math.max(0, settings?.crewLeadRateUsd ?? settings?.crewOtRateUsd ?? 0),
    };
  },
});

/**
 * Test-only: drop the invitations for an email so the invite spec does not
 * accumulate a row per run on the shared deployment. `listInvitationsAdmin`
 * pages with `.take(2000)`, and `resendInviteAdmin` updates by email rather
 * than by id, so stale duplicates for one address are actively harmful.
 */
export const deleteInvitationsByEmail = mutation({
  args: { email: v.string() },
  returns: v.object({ deletedInvitations: v.number(), deletedPending: v.number() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "invitation",
      paginationOpts: { cursor: null, numItems: 2000 },
    });
    const rows = (result?.page ?? []) as Array<{ id?: string; _id?: string; email?: string }>;
    let deletedInvitations = 0;
    let deletedPending = 0;
    for (const row of rows) {
      if ((row.email ?? "").toLowerCase() !== email) continue;
      const invitationId = getId(row);
      if (!invitationId) continue;
      const pending = await ctx.db
        .query("pendingUserInvites")
        .withIndex("by_invitationId", (q) => q.eq("invitationId", invitationId))
        .unique();
      if (pending) {
        await ctx.db.delete(pending._id);
        deletedPending += 1;
      }
      await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: {
          model: "invitation",
          where: [{ field: "_id", value: invitationId }],
        },
      });
      deletedInvitations += 1;
    }
    return { deletedInvitations, deletedPending };
  },
});

/**
 * Test-only: force a user's better-auth role.
 *
 * Cleanup only. The promote spec grants admin through the UI (that grant is the
 * thing under test) and demotes the same way, but if it fails in between, an
 * extra admin would be left on the shared deployment for every later run.
 */
export const setAuthUserRole = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("user")),
  },
  returns: v.object({ ok: v.literal(true), userId: v.string(), role: v.string() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    });
    const userId = getId(user);
    if (!userId) throw new Error(`No user for ${email}.`);
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "user",
        where: [{ field: "email", value: email }],
        update: { role: args.role, updatedAt: Date.now() },
      },
    });
    return { ok: true as const, userId, role: args.role };
  },
});

/* -------------------------------------------------------------------------- */
/* Inventory catalog (Batch 10)                                               */
/*                                                                            */
/* The catalog is the one data model every other spec seeds against, and its  */
/* fixtures are not events, so `pruneE2eSeedData` cannot reach them. Each      */
/* catalog spec therefore names what it creates and hands those names back to  */
/* `deleteInventoryCatalogFixtures` in an `afterAll`.                          */
/* -------------------------------------------------------------------------- */

const inventoryResourceLink = v.object({ title: v.string(), url: v.string() });

/**
 * Test-only: idempotent category upsert.
 *
 * `inventoryTypes.create` refuses a category that is missing or inactive, so a
 * spec that drives the type form needs its category to exist first. The
 * shared deployment normally has the defaults, but a fresh anonymous CI
 * deployment does not — and a spec failing on "Unknown or inactive category
 * key" reads as a broken form rather than a missing fixture.
 */
export const ensureInventoryCategory = mutation({
  args: {
    key: v.string(),
    label: v.optional(v.string()),
    publicBucket: v.optional(
      v.union(
        v.literal("lighting"),
        v.literal("sound"),
        v.literal("environmental"),
        v.literal("staging"),
        v.literal("misc"),
      ),
    ),
  },
  returns: v.object({ categoryId: v.id("inventoryCategories"), key: v.string(), label: v.string() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const key = args.key.trim().toLowerCase();
    if (!key) throw new Error("Category key is required.");
    const label = args.label?.trim() || key;
    const now = Date.now();
    const existing = await ctx.db
      .query("inventoryCategories")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        active: true,
        publicBucket: args.publicBucket ?? existing.publicBucket,
        updatedAt: now,
      });
      return { categoryId: existing._id, key, label: existing.label };
    }
    const categoryId = await ctx.db.insert("inventoryCategories", {
      key,
      label,
      publicBucket: args.publicBucket,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { categoryId, key, label };
  },
});

/** Test-only: idempotent capability upsert (same reasoning as the category). */
export const ensureInventoryCapability = mutation({
  args: { key: v.string(), label: v.optional(v.string()) },
  returns: v.object({ capabilityId: v.id("capabilityDefinitions"), key: v.string() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const key = args.key.trim().toLowerCase();
    if (!key) throw new Error("Capability key is required.");
    const now = Date.now();
    const existing = await ctx.db
      .query("capabilityDefinitions")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { active: true, updatedAt: now });
      return { capabilityId: existing._id, key };
    }
    const capabilityId = await ctx.db.insert("capabilityDefinitions", {
      key,
      label: args.label?.trim() || key,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { capabilityId, key };
  },
});

/** Test-only: a catalog type for specs whose subject is something else. */
export const seedInventoryType = mutation({
  args: {
    name: v.string(),
    model: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    category: v.optional(v.string()),
    msrpUsd: v.optional(v.number()),
    subsidizedRentalPriceUsd: v.optional(v.number()),
    nonSubsidizedRentalPriceUsd: v.optional(v.number()),
    publicListing: v.optional(v.boolean()),
    publicProfile: v.optional(v.boolean()),
  },
  returns: v.object({ typeId: v.id("inventoryTypes"), name: v.string(), model: v.string() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const name = args.name.trim();
    const model = args.model?.trim() || `${name} Model`;
    const typeId = await ctx.db.insert("inventoryTypes", {
      name,
      model,
      manufacturer: args.manufacturer?.trim(),
      category: (args.category ?? "misc").trim().toLowerCase(),
      msrpUsd: args.msrpUsd,
      subsidizedRentalPriceUsd: args.subsidizedRentalPriceUsd,
      nonSubsidizedRentalPriceUsd: args.nonSubsidizedRentalPriceUsd,
      rentalPriceUsd: args.nonSubsidizedRentalPriceUsd,
      manualUrls: [],
      capabilities: [],
      publicListing: args.publicListing ?? false,
      publicProfile: args.publicProfile ?? false,
      createdAt: now,
      updatedAt: now,
    });
    return { typeId, name, model };
  },
});

/** Test-only: a storage location, optionally nested under an existing path. */
export const seedStorageLocation = mutation({
  args: { name: v.string(), parentPath: v.optional(v.string()) },
  returns: v.object({
    locationId: v.id("storageLocations"),
    name: v.string(),
    path: v.string(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const name = args.name.trim();
    let path = name;
    let parentId: Id<"storageLocations"> | undefined;
    const parentPath = args.parentPath?.trim();
    if (parentPath) {
      const parent = await ctx.db
        .query("storageLocations")
        .withIndex("by_path", (q) => q.eq("path", parentPath))
        .first();
      if (!parent) throw new Error(`No storage location at path "${parentPath}".`);
      parentId = parent._id;
      path = `${parent.path} > ${name}`;
    }
    const locationId = await ctx.db.insert("storageLocations", {
      name,
      parentId,
      path,
      createdAt: now,
      updatedAt: now,
    });
    return { locationId, name, path };
  },
});

/** Test-only: an inventory item pinned to a seeded type. */
export const seedInventoryItem = mutation({
  args: {
    assetId: v.string(),
    typeName: v.string(),
    serialNumber: v.optional(v.string()),
    storageLocationPath: v.optional(v.string()),
  },
  returns: v.object({ itemId: v.id("inventoryItems"), assetId: v.string() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const now = Date.now();
    const assetId = args.assetId.trim();
    const type = await ctx.db
      .query("inventoryTypes")
      .withIndex("by_name", (q) => q.eq("name", args.typeName.trim()))
      .first();
    if (!type) throw new Error(`No inventory type named "${args.typeName}".`);
    let storageLocationId: Id<"storageLocations"> | undefined;
    const locationPath = args.storageLocationPath?.trim();
    if (locationPath) {
      const location = await ctx.db
        .query("storageLocations")
        .withIndex("by_path", (q) => q.eq("path", locationPath))
        .first();
      if (!location) throw new Error(`No storage location at path "${locationPath}".`);
      storageLocationId = location._id;
    }
    const itemId = await ctx.db.insert("inventoryItems", {
      assetId,
      serialNumber: args.serialNumber?.trim(),
      typeId: type._id,
      storageLocationId,
      status: "functional",
      createdAt: now,
      updatedAt: now,
    });
    return { itemId, assetId };
  },
});

/**
 * Test-only: everything the types manager writes, read back by name.
 *
 * `linkedItemCount` and `packageLineCount` are the two things
 * `inventoryTypes.remove` refuses on, so a spec asserting the refusal can show
 * *why* the row survived rather than just that it did.
 */
export const getInventoryTypeByName = query({
  args: { name: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      typeId: v.id("inventoryTypes"),
      name: v.string(),
      model: v.string(),
      manufacturer: v.union(v.string(), v.null()),
      category: v.string(),
      description: v.union(v.string(), v.null()),
      tips: v.union(v.string(), v.null()),
      msrpUsd: v.union(v.number(), v.null()),
      subsidizedRentalPriceUsd: v.union(v.number(), v.null()),
      nonSubsidizedRentalPriceUsd: v.union(v.number(), v.null()),
      rentalPriceUsd: v.union(v.number(), v.null()),
      capabilities: v.array(v.string()),
      manualUrls: v.array(inventoryResourceLink),
      gdtfUrls: v.array(inventoryResourceLink),
      publicListing: v.boolean(),
      publicProfile: v.boolean(),
      publicSlug: v.union(v.string(), v.null()),
      linkedItemCount: v.number(),
      packageLineCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const type = await ctx.db
      .query("inventoryTypes")
      .withIndex("by_name", (q) => q.eq("name", args.name.trim()))
      .first();
    if (!type) return null;
    const linkedItems = await ctx.db
      .query("inventoryItems")
      .withIndex("by_typeId", (q) => q.eq("typeId", type._id))
      .take(50);
    const packageLines = await ctx.db
      .query("inventoryPackageItems")
      .withIndex("by_typeId", (q) => q.eq("typeId", type._id))
      .take(50);
    return {
      typeId: type._id,
      name: type.name,
      model: type.model,
      manufacturer: type.manufacturer ?? null,
      category: type.category,
      description: type.description ?? null,
      tips: type.tips ?? null,
      msrpUsd: type.msrpUsd ?? null,
      subsidizedRentalPriceUsd: type.subsidizedRentalPriceUsd ?? null,
      nonSubsidizedRentalPriceUsd: type.nonSubsidizedRentalPriceUsd ?? null,
      rentalPriceUsd: type.rentalPriceUsd ?? null,
      capabilities: type.capabilities,
      manualUrls: type.manualUrls,
      gdtfUrls: type.categoryMetadata?.lighting?.gdtfUrls ?? [],
      publicListing: Boolean(type.publicListing),
      publicProfile: Boolean(type.publicProfile),
      publicSlug: type.publicSlug ?? null,
      linkedItemCount: linkedItems.length,
      packageLineCount: packageLines.length,
    };
  },
});

/**
 * Test-only: a package and its fulfillment BOM, read back by name.
 *
 * Content units store per-option line qty separately from unit qty; callers
 * assert the fulfillment-equivalent totals (single-option units × scale),
 * matching quotes/pull lists. Exclusive units are omitted until #116.
 */
export const getInventoryPackageByName = query({
  args: { name: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      packageId: v.id("inventoryPackages"),
      name: v.string(),
      description: v.union(v.string(), v.null()),
      active: v.boolean(),
      packagePriceCents: v.number(),
      subsidizedPackagePriceUsd: v.union(v.number(), v.null()),
      nonSubsidizedPackagePriceUsd: v.union(v.number(), v.null()),
      publicListing: v.boolean(),
      publicBucket: v.union(v.string(), v.null()),
      publicSlug: v.union(v.string(), v.null()),
      items: v.array(
        v.object({
          typeId: v.id("inventoryTypes"),
          typeName: v.string(),
          quantity: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const pkg = await ctx.db
      .query("inventoryPackages")
      .withIndex("by_name", (q) => q.eq("name", args.name.trim()))
      .first();
    if (!pkg) return null;
    const bom = await listFulfillmentPackageBom(ctx, pkg._id);
    const items = [];
    for (const line of bom) {
      const type = await ctx.db.get(line.typeId);
      items.push({
        typeId: line.typeId,
        typeName: type?.name ?? "(missing type)",
        quantity: line.quantity,
      });
    }
    items.sort((a, b) => a.typeName.localeCompare(b.typeName));
    return {
      packageId: pkg._id,
      name: pkg.name,
      description: pkg.description ?? null,
      active: pkg.active,
      packagePriceCents: pkg.packagePriceCents,
      subsidizedPackagePriceUsd: pkg.subsidizedPackagePriceUsd ?? null,
      nonSubsidizedPackagePriceUsd: pkg.nonSubsidizedPackagePriceUsd ?? null,
      publicListing: Boolean(pkg.publicListing),
      publicBucket: pkg.publicBucket ?? null,
      publicSlug: pkg.publicSlug ?? null,
      items,
    };
  },
});

/**
 * Test-only: an inventory item plus the containment/location edges around it.
 *
 * `inventoryItems.update` cascades the effective storage location down every
 * contained asset, and prefers the container's location over the one submitted
 * on the form. Both of those are invisible from the item's own row, so the
 * children come back with their resolved paths.
 */
export const getInventoryItemByAssetId = query({
  args: { assetId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      itemId: v.id("inventoryItems"),
      assetId: v.string(),
      serialNumber: v.union(v.string(), v.null()),
      typeName: v.union(v.string(), v.null()),
      status: v.union(v.string(), v.null()),
      notes: v.union(v.string(), v.null()),
      storageLocationPath: v.union(v.string(), v.null()),
      containedInAssetId: v.union(v.string(), v.null()),
      contains: v.array(
        v.object({
          assetId: v.optional(v.string()),
          storageLocationPath: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const item = await ctx.db
      .query("inventoryItems")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId.trim()))
      .first();
    if (!item?.assetId) return null;
    const type = await ctx.db.get(item.typeId);
    const location = item.storageLocationId ? await ctx.db.get(item.storageLocationId) : null;
    const container = item.containedInAssetId ? await ctx.db.get(item.containedInAssetId) : null;
    const children = await ctx.db
      .query("inventoryItems")
      .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", item._id))
      .take(50);
    const contains = [];
    for (const child of children) {
      const childLocation = child.storageLocationId
        ? await ctx.db.get(child.storageLocationId)
        : null;
      contains.push({
        assetId: child.assetId,
        storageLocationPath: childLocation?.path ?? null,
      });
    }
    contains.sort((a, b) =>
      (a.assetId ?? "").localeCompare(b.assetId ?? ""),
    );
    return {
      itemId: item._id,
      assetId: item.assetId,
      serialNumber: item.serialNumber ?? null,
      typeName: type?.name ?? null,
      status: item.status ?? null,
      notes: item.notes ?? null,
      storageLocationPath: location?.path ?? null,
      containedInAssetId: container?.assetId ?? null,
      contains,
    };
  },
});

/**
 * Test-only: a storage location by *name*, not path.
 *
 * Looking it up by path would make "the path was composed correctly" circular —
 * the query would only find the row if the assertion already held.
 */
export const getStorageLocationByName = query({
  args: { name: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      locationId: v.id("storageLocations"),
      name: v.string(),
      path: v.string(),
      parentPath: v.union(v.string(), v.null()),
      childPaths: v.array(v.string()),
      linkedItemCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const name = args.name.trim();
    const candidates = await ctx.db.query("storageLocations").withIndex("by_path").take(2000);
    const location = candidates.find((row) => row.name === name);
    if (!location) return null;
    const parent = location.parentId ? await ctx.db.get(location.parentId) : null;
    const children = await ctx.db
      .query("storageLocations")
      .withIndex("by_parentId", (q) => q.eq("parentId", location._id))
      .take(50);
    const linkedItems = await ctx.db
      .query("inventoryItems")
      .withIndex("by_storageLocationId", (q) => q.eq("storageLocationId", location._id))
      .take(50);
    return {
      locationId: location._id,
      name: location.name,
      path: location.path,
      parentPath: parent?.path ?? null,
      childPaths: children.map((row) => row.path).sort(),
      linkedItemCount: linkedItems.length,
    };
  },
});

/**
 * Test-only: what the *public* catalog queries expose for a named row.
 *
 * Deliberately reads `publicInventory` rather than the tables. The public
 * `/types` and `/packages` pages are statically rendered with `revalidate =
 * 3600` and refresh through an on-demand `/api/revalidate` call that needs
 * `REVALIDATE_SECRET`, which the e2e stack does not set — so a freshly toggled
 * type will not show up on the rendered page inside a test run. The query is
 * the real contract; the pages get a separate render smoke.
 *
 * The explicit handler return type is load-bearing, not decoration: calling
 * `ctx.runQuery(api.…)` from a module that `api` itself contains makes the
 * inferred type circular, and TypeScript gives up with TS7022/TS7023 on every
 * expression in the body.
 */
type PublicInventoryListing = {
  type: {
    bucket: string;
    name: string;
    publicProfileEnabled: boolean;
    capabilities: string[];
    description: string | null;
    tips: string | null;
    manualCount: number;
    publicSlug: string | null;
  } | null;
  package: {
    bucket: string;
    name: string;
    description: string | null;
    publicSlug: string | null;
  } | null;
};

export const getPublicInventoryListing = query({
  args: {
    typeName: v.optional(v.string()),
    packageName: v.optional(v.string()),
  },
  returns: v.object({
    type: v.union(
      v.null(),
      v.object({
        bucket: v.string(),
        name: v.string(),
        publicProfileEnabled: v.boolean(),
        capabilities: v.array(v.string()),
        description: v.union(v.string(), v.null()),
        tips: v.union(v.string(), v.null()),
        manualCount: v.number(),
        publicSlug: v.union(v.string(), v.null()),
      }),
    ),
    package: v.union(
      v.null(),
      v.object({
        bucket: v.string(),
        name: v.string(),
        description: v.union(v.string(), v.null()),
        publicSlug: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<PublicInventoryListing> => {
    assertE2eHelpersEnabled();
    const typeName = args.typeName?.trim();
    const packageName = args.packageName?.trim();

    let type: PublicInventoryListing["type"] = null;
    if (typeName) {
      const rows: Array<{
        bucket: string;
        type: {
          name: string;
          capabilities: string[];
          description?: string;
          publicProfileEnabled: boolean;
          tips?: string;
          manualUrls?: Array<{ title: string; url: string }>;
          publicSlug?: string;
        };
      }> = await ctx.runQuery(api.publicInventory.listPublicTypes, {});
      const row = rows.find((entry) => entry.type.name === typeName);
      if (row) {
        type = {
          bucket: row.bucket,
          name: row.type.name,
          publicProfileEnabled: row.type.publicProfileEnabled,
          capabilities: row.type.capabilities,
          description: row.type.description ?? null,
          tips: row.type.tips ?? null,
          manualCount: row.type.manualUrls?.length ?? 0,
          publicSlug: row.type.publicSlug ?? null,
        };
      }
    }

    let pkg: PublicInventoryListing["package"] = null;
    if (packageName) {
      const rows: Array<{
        bucket: string;
        package: { name: string; description?: string; publicSlug?: string };
      }> = await ctx.runQuery(api.publicInventory.listPublicPackages, {});
      const row = rows.find((entry) => entry.package.name === packageName);
      if (row) {
        pkg = {
          bucket: row.bucket,
          name: row.package.name,
          description: row.package.description ?? null,
          publicSlug: row.package.publicSlug ?? null,
        };
      }
    }

    return { type, package: pkg };
  },
});

/**
 * Test-only: drop the catalog rows a spec named, in dependency order.
 *
 * `pruneE2eSeedData` only knows about events, and catalog rows are read with
 * `.take(500)`/`.take(1500)` caps that a per-run leak would eventually push the
 * newest fixture out of. Deleting is done through `ctx.db` rather than the
 * product mutations on purpose: the product guards ("cannot delete a type with
 * linked items") are the thing under test, and cleanup must not depend on the
 * behaviour a failing spec may have left half-applied.
 */
export const deleteInventoryCatalogFixtures = mutation({
  args: {
    assetIds: v.optional(v.array(v.string())),
    packageNames: v.optional(v.array(v.string())),
    typeNames: v.optional(v.array(v.string())),
    locationNames: v.optional(v.array(v.string())),
    categoryKeys: v.optional(v.array(v.string())),
    capabilityKeys: v.optional(v.array(v.string())),
  },
  returns: v.object({
    deletedItems: v.number(),
    deletedPackages: v.number(),
    deletedPackageLines: v.number(),
    deletedTypes: v.number(),
    deletedLocations: v.number(),
    deletedCategories: v.number(),
    deletedCapabilities: v.number(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    let deletedItems = 0;
    let deletedPackages = 0;
    let deletedPackageLines = 0;
    let deletedTypes = 0;
    let deletedLocations = 0;
    let deletedCategories = 0;
    let deletedCapabilities = 0;

    // Items first: a type or location still referenced by one cannot go away
    // cleanly, and a contained asset must lose its container before the
    // container row disappears.
    for (const rawAssetId of args.assetIds ?? []) {
      const assetId = rawAssetId.trim();
      if (!assetId) continue;
      const item = await ctx.db
        .query("inventoryItems")
        .withIndex("by_assetId", (q) => q.eq("assetId", assetId))
        .first();
      if (!item) continue;
      for (const child of await ctx.db
        .query("inventoryItems")
        .withIndex("by_containedInAssetId", (q) => q.eq("containedInAssetId", item._id))
        .take(100)) {
        await ctx.db.patch(child._id, { containedInAssetId: undefined, updatedAt: Date.now() });
      }
      await ctx.db.delete(item._id);
      deletedItems += 1;
    }

    for (const rawName of args.packageNames ?? []) {
      const name = rawName.trim();
      if (!name) continue;
      const pkg = await ctx.db
        .query("inventoryPackages")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (!pkg) continue;
      for (const line of await ctx.db
        .query("inventoryPackageItems")
        .withIndex("by_packageId", (q) => q.eq("packageId", pkg._id))
        .take(200)) {
        await ctx.db.delete(line._id);
        deletedPackageLines += 1;
      }
      const groups = await ctx.db
        .query("inventoryPackageOptionGroups")
        .withIndex("by_packageId", (q) => q.eq("packageId", pkg._id))
        .take(40);
      for (const group of groups) {
        for (const option of await ctx.db
          .query("inventoryPackageOptions")
          .withIndex("by_optionGroupId", (q) => q.eq("optionGroupId", group._id))
          .take(40)) {
          await ctx.db.delete(option._id);
        }
        await ctx.db.delete(group._id);
      }
      await ctx.db.delete(pkg._id);
      deletedPackages += 1;
    }

    for (const rawName of args.typeNames ?? []) {
      const name = rawName.trim();
      if (!name) continue;
      const type = await ctx.db
        .query("inventoryTypes")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (!type) continue;
      for (const line of await ctx.db
        .query("inventoryPackageItems")
        .withIndex("by_typeId", (q) => q.eq("typeId", type._id))
        .take(200)) {
        await ctx.db.delete(line._id);
        deletedPackageLines += 1;
      }
      for (const item of await ctx.db
        .query("inventoryItems")
        .withIndex("by_typeId", (q) => q.eq("typeId", type._id))
        .take(100)) {
        await ctx.db.delete(item._id);
        deletedItems += 1;
      }
      await ctx.db.delete(type._id);
      deletedTypes += 1;
    }

    // Deepest paths first, so a parent is never deleted out from under a child.
    const locationNames = new Set((args.locationNames ?? []).map((name) => name.trim()));
    if (locationNames.size) {
      const candidates = await ctx.db.query("storageLocations").withIndex("by_path").take(2000);
      const doomed = candidates
        .filter((row) => locationNames.has(row.name))
        .sort((a, b) => b.path.length - a.path.length);
      for (const location of doomed) {
        for (const item of await ctx.db
          .query("inventoryItems")
          .withIndex("by_storageLocationId", (q) => q.eq("storageLocationId", location._id))
          .take(100)) {
          await ctx.db.patch(item._id, {
            storageLocationId: undefined,
            updatedAt: Date.now(),
          });
        }
        await ctx.db.delete(location._id);
        deletedLocations += 1;
      }
    }

    for (const rawKey of args.categoryKeys ?? []) {
      const key = rawKey.trim().toLowerCase();
      if (!key) continue;
      const category = await ctx.db
        .query("inventoryCategories")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (!category) continue;
      await ctx.db.delete(category._id);
      deletedCategories += 1;
    }

    for (const rawKey of args.capabilityKeys ?? []) {
      const key = rawKey.trim().toLowerCase();
      if (!key) continue;
      const capability = await ctx.db
        .query("capabilityDefinitions")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (!capability) continue;
      await ctx.db.delete(capability._id);
      deletedCapabilities += 1;
    }

    return {
      deletedItems,
      deletedPackages,
      deletedPackageLines,
      deletedTypes,
      deletedLocations,
      deletedCategories,
      deletedCapabilities,
    };
  },
});

/**
 * Test-only: bounded catalog sizes.
 *
 * The admin catalog lists are capped (`inventoryTypes.listOptions` takes 1500,
 * `inventoryPackages.list` takes 500, `inventoryItems.listSummaries` takes
 * 1000). A spec that seeds a row and then cannot find it in a picker is almost
 * always looking at one of those caps rather than at a broken selector, so the
 * numbers are worth being able to read directly.
 */
export const getInventoryCatalogCounts = query({
  args: {},
  returns: v.object({
    types: v.number(),
    items: v.number(),
    packages: v.number(),
    locations: v.number(),
    categories: v.number(),
    capabilities: v.number(),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    assertE2eHelpersEnabled();
    const cap = 4000;
    const types = await ctx.db.query("inventoryTypes").take(cap);
    const items = await ctx.db.query("inventoryItems").take(cap);
    const packages = await ctx.db.query("inventoryPackages").take(cap);
    const locations = await ctx.db.query("storageLocations").take(cap);
    const categories = await ctx.db.query("inventoryCategories").take(cap);
    const capabilities = await ctx.db.query("capabilityDefinitions").take(cap);
    return {
      types: types.length,
      items: items.length,
      packages: packages.length,
      locations: locations.length,
      categories: categories.length,
      capabilities: capabilities.length,
      truncated: [types, items, packages, locations].some((rows) => rows.length === cap),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Batch 14: invoice managers, fee definitions, terms templates                */
/* -------------------------------------------------------------------------- */

function normalizeFeeDefinitionKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Test-only: a fee definition by its normalized key.
 *
 * `invoiceFeeDefinitions.create` normalizes the key before storing, so lookups
 * normalize too — otherwise a spec that created "E2E Fee 1" via the UI could not
 * find it by the same string it typed.
 */
export const getInvoiceFeeDefinitionByKey = query({
  args: { key: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("invoiceFeeDefinitions"),
      key: v.string(),
      label: v.string(),
      description: v.union(v.string(), v.null()),
      defaultAmountUsd: v.union(v.number(), v.null()),
      active: v.boolean(),
      sortOrder: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const row = await ctx.db
      .query("invoiceFeeDefinitions")
      .withIndex("by_key", (q) => q.eq("key", normalizeFeeDefinitionKey(args.key)))
      .unique();
    if (!row) return null;
    return {
      id: row._id,
      key: row.key,
      label: row.label,
      description: row.description ?? null,
      defaultAmountUsd: row.defaultAmountUsd ?? null,
      active: row.active,
      sortOrder: row.sortOrder ?? null,
    };
  },
});

/**
 * Test-only: a terms template by its label.
 */
export const getInvoiceTermsTemplateByLabel = query({
  args: { label: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("invoiceTerms"),
      label: v.string(),
      version: v.string(),
      markdown: v.string(),
      active: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const row = await ctx.db
      .query("invoiceTerms")
      .withIndex("by_label", (q) => q.eq("label", args.label.trim()))
      .first();
    if (!row) return null;
    return {
      id: row._id,
      label: row.label,
      version: row.version,
      markdown: row.markdown,
      active: row.active,
    };
  },
});

/**
 * Test-only: which terms templates an invoice references, plus its
 * additional-terms free text. `termsIds` is the normalized view — the legacy
 * single `termsId` column is folded in so a spec reads one shape.
 */
export const getInvoiceTermsState = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.union(
    v.null(),
    v.object({
      termsIds: v.array(v.id("invoiceTerms")),
      additionalTermsMarkdown: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;
    return {
      termsIds: invoice.termsIds?.length
        ? invoice.termsIds
        : invoice.termsId
          ? [invoice.termsId]
          : [],
      additionalTermsMarkdown: invoice.additionalTermsMarkdown ?? null,
    };
  },
});

/**
 * Test-only: overwrite a user's invoice-manager profile fields (title/phone).
 *
 * The managers roster edits these through `users.updateUserAdmin`; the spec
 * asserts the write with `getUserAdminStateByEmail`, then calls this to restore
 * the shared admin row to its empty default — a failed run must not leave a
 * fixture title on the account other worktrees sign in as.
 */
export const setUserAdminProfileFields = mutation({
  args: {
    email: v.string(),
    title: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    })) as { id?: string; _id?: string } | null;
    const userId = getId(user);
    if (!userId) throw new Error("User not found.");
    const now = Date.now();
    const existing = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title?.trim() || undefined,
        phone: args.phone?.trim() || undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userAdminProfiles", {
        userId,
        title: args.title?.trim() || undefined,
        phone: args.phone?.trim() || undefined,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true as const };
  },
});

/**
 * Test-only: delete fee-definition and terms-template fixtures directly through
 * `ctx.db` (not the product mutations), plus any draft invoices a spec created.
 *
 * Invoices first — a line item may carry `feeDefinitionId` and an invoice may
 * carry `termsIds`, so the referencing rows go away before the definitions they
 * point at, matching how the product's own delete guards would be exercised if
 * the fixtures were still in a state the UI could reach.
 */
export const deleteInvoiceSettingsFixtures = mutation({
  args: {
    feeKeys: v.optional(v.array(v.string())),
    termLabels: v.optional(v.array(v.string())),
    invoiceIds: v.optional(v.array(v.id("invoices"))),
  },
  returns: v.object({
    deletedInvoices: v.number(),
    deletedFees: v.number(),
    deletedTerms: v.number(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    let deletedInvoices = 0;
    for (const invoiceId of args.invoiceIds ?? []) {
      const invoice = await ctx.db.get(invoiceId);
      if (!invoice) continue;
      await deleteInvoiceRecord(ctx, invoiceId);
      deletedInvoices += 1;
    }
    let deletedFees = 0;
    for (const rawKey of args.feeKeys ?? []) {
      const key = rawKey.trim();
      if (!key) continue;
      const row = await ctx.db
        .query("invoiceFeeDefinitions")
        .withIndex("by_key", (q) => q.eq("key", normalizeFeeDefinitionKey(key)))
        .unique();
      if (!row) continue;
      await ctx.db.delete(row._id);
      deletedFees += 1;
    }
    let deletedTerms = 0;
    for (const rawLabel of args.termLabels ?? []) {
      const label = rawLabel.trim();
      if (!label) continue;
      const rows = await ctx.db
        .query("invoiceTerms")
        .withIndex("by_label", (q) => q.eq("label", label))
        .take(50);
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deletedTerms += 1;
      }
    }
    return { deletedInvoices, deletedFees, deletedTerms };
  },
});

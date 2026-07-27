import { payPeriodForDate } from "@arbor/format";
import { v } from "convex/values";
import { customAlphabet } from "nanoid";
import { hashPassword } from "better-auth/crypto";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertE2eHelpersEnabled } from "./lib/e2eGuard";
import { inviteAcceptUrl } from "./email/constants";
import { enqueueEmail } from "./email/enqueue";
import { scheduleUserInviteEmail } from "./email/invitations";
import {
  allocateBandPaymentConfirmationToken,
  allocateRequestNumber,
} from "./lib/publicReferenceIds";

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
  const start = new Date();
  start.setDate(start.getDate() + daysAhead);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start);
  end.setHours(22, 0, 0, 0);
  return { startAt: start.getTime(), endAt: end.getTime() };
}

async function insertSubmittedBookingRequest(ctx: MutationCtx, eventName?: string) {
  const now = Date.now();
  const { startAt, endAt } = futureEventWindow(18);
  const requestNumber = await allocateRequestNumber(ctx);
  const publicToken = makeToken();
  const resolvedEventName = eventName?.trim() || `E2E Booking ${now}`;
  const start = new Date(startAt);
  const end = new Date(endAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const eventDateText = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const eventStartTimeText = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const eventEndTimeText = `${pad(end.getHours())}:${pad(end.getMinutes())}`;

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
    setupAtMs: startAt - 2 * 60 * 60 * 1000,
    flexibleSetupTime: true,
    eventName: resolvedEventName,
    eventCategory: "Concert / Showcase",
    crewOrRental: "Crewed event",
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
          update: { name, updatedAt: now, emailVerified: true },
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
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;
    return {
      status: request.status,
      convertedEventId: request.convertedEventId ?? null,
      linkedInvoiceId: request.linkedInvoiceId ?? null,
      requestNumber: request.requestNumber ?? null,
    };
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
    const reportId = await ctx.db.insert("damageReports", {
      inventoryItemId,
      assetId,
      typeId,
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
      assetId: v.string(),
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

    return {
      scannedEvents: candidates.length,
      matchedEvents: doomed.length,
      deletedEvents: doomed.length,
      deletedChildren,
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
        })),
    };
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

/* -------------------------------------------------------------------------- */
/* Batch 9: users, access, and rates                                           */
/* -------------------------------------------------------------------------- */

/**
 * Emails the Batch 9 helpers are allowed to create and destroy.
 *
 * Every other suite works by seeding new rows with a unique stamp, but users
 * cannot be seeded that way: `listUsersForAdmin` returns *every* auth user and
 * the Users table has no pagination, so one throwaway user per run would grow
 * the shared deployment's user list forever. These specs instead reuse fixed
 * addresses and reset them, which keeps the footprint constant.
 *
 * The prefix is deliberately narrower than `e2e-`: the shared admin, crew, and
 * band fixtures are all `e2e-*@arborlive.test`, and deleting one of those would
 * take down every other spec's sign-in.
 */
const MANAGED_USER_PREFIX = "e2e-managed-";

function assertManagedEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized.startsWith(MANAGED_USER_PREFIX)) {
    throw new Error(
      `Refusing to manage ${normalized}: Batch 9 helpers only touch ${MANAGED_USER_PREFIX}* addresses.`,
    );
  }
  return normalized;
}

async function findAuthUserByEmail(ctx: MutationCtx, email: string) {
  return await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email }],
  });
}

/**
 * Test-only: delete a managed user and every row that hangs off them.
 *
 * Specs call this before driving the create/invite UI so each run starts from
 * "this person does not exist". That matters beyond tidiness for invites:
 * `inviteUserAdmin` marks an invitation accepted on the spot when a user with
 * that email already exists, so a leftover user turns the pending-invite spec
 * into a no-op that still passes.
 */
export const resetManagedUserByEmail = mutation({
  args: { email: v.string() },
  returns: v.object({
    email: v.string(),
    deletedUser: v.boolean(),
    deletedRows: v.number(),
  }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = assertManagedEmail(args.email);
    const existing = await findAuthUserByEmail(ctx, email);
    const userId = getId(existing);
    let deletedRows = 0;

    if (userId) {
      for (const row of await ctx.db
        .query("userAdminProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(10)) {
        await ctx.db.delete(row._id);
        deletedRows += 1;
      }
      for (const row of await ctx.db
        .query("userOrganizationMemberships")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(50)) {
        await ctx.db.delete(row._id);
        deletedRows += 1;
      }
      for (const row of await ctx.db
        .query("userActiveOrganizations")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(10)) {
        await ctx.db.delete(row._id);
        deletedRows += 1;
      }
      for (const row of await ctx.db
        .query("userOnboarding")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(10)) {
        await ctx.db.delete(row._id);
        deletedRows += 1;
      }
      for (const row of await ctx.db
        .query("userCompensationRates")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(10)) {
        await ctx.db.delete(row._id);
        deletedRows += 1;
      }

      // Better Auth rows last: the app tables above are keyed by this user id,
      // so dropping the auth user first would orphan them beyond reach.
      for (const model of ["session", "account", "member"] as const) {
        const rows = await ctx.runQuery(components.betterAuth.adapter.findMany, {
          model,
          where: [{ field: "userId", value: userId }],
          paginationOpts: { cursor: null, numItems: 200 },
        });
        for (const row of (rows?.page ?? []) as unknown[]) {
          const id = getId(row);
          if (!id) continue;
          await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
            input: { model, where: [{ field: "_id", value: id }] },
          });
          deletedRows += 1;
        }
      }
      await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: { model: "user", where: [{ field: "_id", value: userId }] },
      });
    }

    return { email, deletedUser: Boolean(userId), deletedRows };
  },
});

/**
 * Test-only: drop every invitation for a managed email.
 *
 * Invitations are never deleted by the product — cancelling only flips a status
 * — so without this the invite spec would stack a new row on the shared
 * deployment every run, and its "the newest invite for this email" assertions
 * would be reading whichever row `findMany` happened to return first.
 */
export const clearInvitationsForEmail = mutation({
  args: { email: v.string() },
  returns: v.object({ deletedInvitations: v.number(), deletedPending: v.number() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = assertManagedEmail(args.email);

    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "invitation",
      where: [{ field: "email", value: email }],
      paginationOpts: { cursor: null, numItems: 200 },
    });
    let deletedInvitations = 0;
    let deletedPending = 0;
    for (const row of (result?.page ?? []) as unknown[]) {
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
        input: { model: "invitation", where: [{ field: "_id", value: invitationId }] },
      });
      deletedInvitations += 1;
    }
    return { deletedInvitations, deletedPending };
  },
});

/**
 * Test-only: everything the Users table renders for one person, by email.
 *
 * Deliberately reads the underlying rows rather than calling
 * `users.listUsersForAdmin`, so a spec still fails if that query starts
 * reporting something the database does not say.
 */
export const getUserAdminStateByEmail = query({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.string(),
      name: v.string(),
      email: v.string(),
      role: v.string(),
      banned: v.boolean(),
      active: v.boolean(),
      title: v.union(v.string(), v.null()),
      phone: v.union(v.string(), v.null()),
      verticals: v.array(v.string()),
      disciplines: v.array(v.string()),
      payrollMethod: v.union(v.string(), v.null()),
      rateMode: v.union(v.string(), v.null()),
      customHourlyRateUsd: v.union(v.number(), v.null()),
      effectiveHourlyRateUsd: v.union(v.number(), v.null()),
      onboardingStatus: v.union(v.string(), v.null()),
      defaultOrganizationId: v.union(v.string(), v.null()),
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
    })) as { name?: string; email?: string; role?: string; banned?: boolean } | null;
    const userId = getId(user);
    if (!user || !userId) return null;

    const profile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const rate = await ctx.db
      .query("userCompensationRates")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const onboarding = await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const settings = await ctx.db
      .query("invoiceSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    const memberships = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(50);

    const organizations = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "organization",
      paginationOpts: { cursor: null, numItems: 200 },
    });
    const orgNameById = new Map<string, string>();
    for (const org of (organizations?.page ?? []) as Array<{ name?: string }>) {
      const id = getId(org);
      if (id) orgNameById.set(id, org.name ?? id);
    }

    const rateMode = rate?.rateMode ?? (rate ? "custom" : null);
    const effectiveHourlyRateUsd = !rate
      ? null
      : rateMode === "normal"
        ? Math.max(0, settings?.crewNormalRateUsd ?? 0)
        : rateMode === "lead"
          ? Math.max(0, settings?.crewLeadRateUsd ?? settings?.crewOtRateUsd ?? 0)
          : Math.max(0, rate.hourlyRateUsd);

    return {
      userId,
      name: user.name ?? "",
      email: user.email ?? email,
      role: user.role ?? "member",
      banned: Boolean(user.banned),
      active: profile?.active ?? true,
      title: profile?.title ?? null,
      phone: profile?.phone ?? null,
      verticals: (profile?.verticals ?? []) as string[],
      disciplines: (profile?.disciplines ?? []) as string[],
      payrollMethod: profile?.payrollMethod ?? null,
      rateMode,
      customHourlyRateUsd: rate?.hourlyRateUsd ?? null,
      effectiveHourlyRateUsd,
      onboardingStatus: onboarding?.status ?? null,
      defaultOrganizationId: profile?.defaultOrganizationId ?? null,
      memberships: memberships.map((row) => ({
        organizationId: row.organizationId,
        organizationName: orgNameById.get(row.organizationId) ?? row.organizationId,
        role: row.role,
        active: row.active,
      })),
    };
  },
});

/**
 * Test-only: the newest invitation for an email, plus its pending-invite row.
 *
 * The two live in different stores — the invitation in the Better Auth
 * component, the verticals/disciplines/rate payload in `pendingUserInvites` —
 * and the Invitations table joins them, so both belong in one assertion.
 */
export const getInvitationStateByEmail = query({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      invitationId: v.string(),
      email: v.string(),
      role: v.string(),
      status: v.string(),
      organizationId: v.string(),
      createdAt: v.number(),
      expiresAt: v.number(),
      verticals: v.array(v.string()),
      disciplines: v.array(v.string()),
      rateMode: v.union(v.string(), v.null()),
      payrollMethod: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "invitation",
      where: [{ field: "email", value: email }],
      paginationOpts: { cursor: null, numItems: 200 },
    });
    const invites = ((result?.page ?? []) as Array<{
      email?: string;
      role?: string;
      status?: string;
      organizationId?: string;
      createdAt?: number;
      expiresAt?: number;
    }>)
      .filter((row) => Boolean(getId(row)))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const invite = invites[0];
    if (!invite) return null;
    const invitationId = getId(invite)!;

    const pending = await ctx.db
      .query("pendingUserInvites")
      .withIndex("by_invitationId", (q) => q.eq("invitationId", invitationId))
      .unique();

    return {
      invitationId,
      email: invite.email ?? email,
      role: invite.role ?? "member",
      status: invite.status ?? "pending",
      organizationId: invite.organizationId ?? "",
      createdAt: invite.createdAt ?? 0,
      expiresAt: invite.expiresAt ?? 0,
      verticals: (pending?.verticals ?? []) as string[],
      disciplines: (pending?.disciplines ?? []) as string[],
      rateMode: pending?.rateMode ?? null,
      payrollMethod: pending?.payrollMethod ?? null,
    };
  },
});

/**
 * Test-only: read the global crew rates.
 *
 * Read-only on purpose. `invoiceSettings.update` writes these globally, and on
 * the shared deployment that silently re-prices every other worktree's crew
 * lines — so the rates spec pins a user to Normal and checks it resolves to
 * whatever this returns, rather than setting a value it controls.
 */
export const getGlobalCrewRates = query({
  args: {},
  returns: v.object({
    normalRateUsd: v.number(),
    leadRateUsd: v.number(),
  }),
  handler: async (ctx) => {
    assertE2eHelpersEnabled();
    const settings = await ctx.db
      .query("invoiceSettings")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();
    return {
      normalRateUsd: Math.max(0, settings?.crewNormalRateUsd ?? 0),
      leadRateUsd: Math.max(0, settings?.crewLeadRateUsd ?? settings?.crewOtRateUsd ?? 0),
    };
  },
});

/**
 * Test-only: force a user's access state without going through `requireAdmin`.
 *
 * The access spec drives the "you cannot remove your own access" guard from the
 * admin's own row. That guard lives in Convex, so if it ever regresses the spec
 * would ban the shared e2e admin and every later spec would fail to sign in.
 * This exists so that spec can restore access unconditionally afterwards, from
 * outside the auth path it just tried to break.
 */
export const setUserAccessByEmail = mutation({
  args: { email: v.string(), removed: v.boolean() },
  returns: v.object({ ok: v.boolean(), userId: v.string() }),
  handler: async (ctx, args) => {
    assertE2eHelpersEnabled();
    const email = args.email.trim().toLowerCase();
    const user = await findAuthUserByEmail(ctx, email);
    const userId = getId(user);
    if (!userId) throw new Error(`No user for ${email}.`);
    const now = Date.now();

    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "user",
        where: [{ field: "email", value: email }],
        update: { banned: args.removed, updatedAt: now },
      },
    });
    const profile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (profile) {
      await ctx.db.patch(profile._id, { active: !args.removed, updatedAt: now });
    }
    return { ok: true, userId };
  },
});

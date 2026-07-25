import { v } from "convex/values";
import { customAlphabet } from "nanoid";
import { hashPassword } from "better-auth/crypto";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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

function assertE2eHelpersEnabled() {
  if (process.env.E2E_HELPERS !== "true") {
    throw new Error("E2E helpers are disabled. Set E2E_HELPERS=true on the Convex deployment.");
  }
  const siteUrl = process.env.SITE_URL ?? "";
  if (!siteUrl.includes("localhost") && !siteUrl.includes("127.0.0.1")) {
    throw new Error("E2E helpers only run when SITE_URL points at localhost.");
  }
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
      v.union(v.literal("pending_email"), v.literal("awaiting_confirmation")),
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
      confirmationEmailSentAt: status === "awaiting_confirmation" ? now - 60_000 : undefined,
      confirmationSentByUserId: status === "awaiting_confirmation" ? "e2e-manager" : undefined,
      confirmationSentByName: status === "awaiting_confirmation" ? "E2E Admin" : undefined,
      confirmationSentByEmail:
        status === "awaiting_confirmation" ? "e2e-admin@arborlive.test" : undefined,
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

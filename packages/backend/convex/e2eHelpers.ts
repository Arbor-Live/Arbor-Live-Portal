import { v } from "convex/values";
import { customAlphabet } from "nanoid";
import { hashPassword } from "better-auth/crypto";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { inviteAcceptUrl } from "./email/constants";
import { enqueueEmail } from "./email/enqueue";
import { scheduleUserInviteEmail } from "./email/invitations";
import { allocateRequestNumber } from "./lib/publicReferenceIds";

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

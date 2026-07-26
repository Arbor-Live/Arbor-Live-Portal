import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { SITE_URL, subjectForTemplate } from "./email/constants";
import { enqueueEmail } from "./email/enqueue";
import {
  getActiveOrganizationContextOrNull,
  getUserId,
  requireAdmin,
  requireAuth,
  type AuthUser,
} from "./lib/auth";
import {
  FWS_JOB_INFO,
  ONBOARDING_LEADERSHIP_EMAILS,
  ONBOARDING_LINKS,
} from "./lib/onboardingLinks";
import {
  normalizePayrollMethod,
  type PayrollMethod,
} from "./lib/crewCompensation";

const onboardingStatusValue = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("waived"),
);

const REMINDER_COOLDOWN_MS = 6 * 24 * 60 * 60 * 1000;

type CrewOnboardingDoc = Doc<"userOnboarding">;

function trainingStepsComplete(row: CrewOnboardingDoc): boolean {
  const base =
    Boolean(row.narcanCompletedAt) &&
    Boolean(row.soberMonitorCompletedAt) &&
    Boolean(row.emergencySopsAcknowledgedAt) &&
    Boolean(row.crewExpectationsAcknowledgedAt) &&
    Boolean(row.liftingCompletedAt);
  if (!base) return false;
  if (row.hasValidDriversLicense) {
    return Boolean(row.cartTrainingCompletedAt);
  }
  return true;
}

function crewRequiredStepsComplete(
  row: CrewOnboardingDoc,
  payrollMethod: PayrollMethod,
): boolean {
  const shared =
    Boolean(row.profileCompletedAt) &&
    Boolean(row.whatsappAcknowledgedAt) &&
    Boolean(row.instagramAcknowledgedAt) &&
    trainingStepsComplete(row) &&
    Boolean(row.agreedToOnboardingDocAt) &&
    Boolean(row.signatureLegalName?.trim());
  if (!shared) return false;
  if (payrollMethod === "external") {
    return Boolean(row.contractorPayAcknowledgedAt);
  }
  return (
    row.hasFederalWorkStudy !== undefined &&
    row.hasFederalWorkStudy !== null &&
    Boolean(row.fwsAcknowledgedAt) &&
    Boolean(row.oseHiringFormCompletedAt) &&
    Boolean(row.timecardAcknowledgedAt)
  );
}

function countIncompleteCrewSteps(
  row: CrewOnboardingDoc,
  payrollMethod: PayrollMethod,
): number {
  let missing = 0;
  const sharedChecks: Array<boolean> = [
    Boolean(row.profileCompletedAt),
    Boolean(row.whatsappAcknowledgedAt),
    Boolean(row.instagramAcknowledgedAt),
    Boolean(row.narcanCompletedAt),
    Boolean(row.soberMonitorCompletedAt),
    Boolean(row.emergencySopsAcknowledgedAt),
    Boolean(row.crewExpectationsAcknowledgedAt),
    Boolean(row.liftingCompletedAt),
    Boolean(row.agreedToOnboardingDocAt) && Boolean(row.signatureLegalName?.trim()),
  ];
  for (const ok of sharedChecks) {
    if (!ok) missing += 1;
  }
  if (row.hasValidDriversLicense && !row.cartTrainingCompletedAt) missing += 1;

  if (payrollMethod === "external") {
    if (!row.contractorPayAcknowledgedAt) missing += 1;
  } else {
    if (
      !(
        row.hasFederalWorkStudy !== undefined &&
        row.hasFederalWorkStudy !== null &&
        Boolean(row.fwsAcknowledgedAt)
      )
    ) {
      missing += 1;
    }
    if (!row.oseHiringFormCompletedAt) missing += 1;
    if (!row.timecardAcknowledgedAt) missing += 1;
  }
  return missing;
}

async function getPayrollMethodForUser(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<PayrollMethod> {
  const profile = await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return normalizePayrollMethod(profile?.payrollMethod);
}

export type MyOnboardingStatus = {
  crew:
    | { status: CrewOnboardingDoc["status"]; incompleteStepCount: number; applicable: true }
    | { applicable: false };
  band:
    | {
        status: Doc<"organizationOnboarding">["status"];
        applicable: true;
        organizationId: string;
      }
    | { applicable: false };
};

export async function resolveMyOnboardingStatus(
  ctx: QueryCtx,
  userId: string,
): Promise<MyOnboardingStatus> {
  const orgContext = await getActiveOrganizationContextOrNull(ctx);

  let crew: MyOnboardingStatus["crew"] = { applicable: false };
  let band: MyOnboardingStatus["band"] = { applicable: false };

  if (orgContext?.organizationType === "arbor_internal") {
    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const payrollMethod = await getPayrollMethodForUser(ctx, userId);
    if (row) {
      crew = {
        applicable: true,
        status: row.status,
        incompleteStepCount: countIncompleteCrewSteps(row, payrollMethod),
      };
    } else {
      crew = {
        applicable: true,
        status: "not_started",
        incompleteStepCount: payrollMethod === "external" ? 10 : 12,
      };
    }
  }

  if (orgContext && (orgContext.organizationType === "band" || orgContext.organizationType === "dj")) {
    const row = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", orgContext.organizationId))
      .unique();
    band = {
      applicable: true,
      status: row?.status ?? "not_started",
      organizationId: orgContext.organizationId,
    };
  }

  return { crew, band };
}

export async function ensureCrewOnboarding(
  ctx: MutationCtx,
  userId: string,
  opts?: { waived?: boolean; waivedByUserId?: string },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("userOnboarding")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (existing) return existing._id;
  if (opts?.waived) {
    return await ctx.db.insert("userOnboarding", {
      userId,
      flow: "crew",
      status: "waived",
      waivedAt: now,
      waivedByUserId: opts.waivedByUserId ?? userId,
      createdAt: now,
      updatedAt: now,
    });
  }
  return await ctx.db.insert("userOnboarding", {
    userId,
    flow: "crew",
    status: "not_started",
    createdAt: now,
    updatedAt: now,
  });
}

export async function ensureOrganizationOnboarding(
  ctx: MutationCtx,
  organizationId: string,
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("organizationOnboarding")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("organizationOnboarding", {
    organizationId,
    status: "not_started",
    createdAt: now,
    updatedAt: now,
  });
}

async function resolveOrgType(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<"arbor_internal" | "band" | "dj"> {
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  if (profile?.organizationType) return profile.organizationType;
  const org = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "organization",
    where: [{ field: "_id", value: organizationId }],
  })) as { slug?: string; name?: string } | null;
  const slug = (org?.slug ?? "").toLowerCase();
  const name = (org?.name ?? "").toLowerCase();
  if (slug === "arbor-live" || name === "arbor live") return "arbor_internal";
  return "band";
}

export async function ensureOnboardingForOrgMembership(
  ctx: MutationCtx,
  args: { userId: string; organizationId: string },
) {
  const orgType = await resolveOrgType(ctx, args.organizationId);
  if (orgType === "arbor_internal") {
    await ensureCrewOnboarding(ctx, args.userId);
  } else {
    await ensureOrganizationOnboarding(ctx, args.organizationId);
  }
  return orgType;
}

async function listAdminAuthUsers(ctx: QueryCtx | MutationCtx) {
  const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "user",
    paginationOpts: { cursor: null, numItems: 500 },
  });
  const users = (result?.page ?? []) as AuthUser[];
  return users.filter((user) => user.role === "admin" && user.email);
}

async function scheduleOnboardingCompletedEmails(
  ctx: MutationCtx,
  args: {
    userId: string;
    name: string;
    email: string;
    hasFederalWorkStudy: boolean | null | undefined;
    hasValidDriversLicense: boolean | undefined;
    signatureLegalName: string;
  },
) {
  const admins = await listAdminAuthUsers(ctx);
  const recipients = new Set<string>();
  for (const admin of admins) {
    if (admin.email) recipients.add(admin.email.trim().toLowerCase());
  }
  for (const email of ONBOARDING_LEADERSHIP_EMAILS) {
    recipients.add(email.toLowerCase());
  }

  const payload = {
    crewName: args.name,
    crewEmail: args.email,
    hasFederalWorkStudy: args.hasFederalWorkStudy ?? false,
    hasValidDriversLicense: args.hasValidDriversLicense ?? false,
    signatureLegalName: args.signatureLegalName,
    dashboardUsersUrl: `${SITE_URL}/dashboard/users`,
  };

  for (const to of recipients) {
    await enqueueEmail(ctx, {
      template: "onboarding_completed",
      to,
      subject: subjectForTemplate("onboarding_completed", args.name),
      idempotencyKey: `onboarding_completed:${args.userId}:${to}`,
      payload,
    });
  }
}

const crewOnboardingReturn = v.object({
  status: onboardingStatusValue,
  incompleteStepCount: v.number(),
  payrollMethod: v.union(v.literal("stanford"), v.literal("external")),
  profileCompletedAt: v.optional(v.number()),
  whatsappAcknowledgedAt: v.optional(v.number()),
  instagramAcknowledgedAt: v.optional(v.number()),
  hasFederalWorkStudy: v.optional(v.union(v.boolean(), v.null())),
  fwsAcknowledgedAt: v.optional(v.number()),
  narcanCompletedAt: v.optional(v.number()),
  soberMonitorCompletedAt: v.optional(v.number()),
  emergencySopsAcknowledgedAt: v.optional(v.number()),
  crewExpectationsAcknowledgedAt: v.optional(v.number()),
  liftingCompletedAt: v.optional(v.number()),
  hasValidDriversLicense: v.optional(v.boolean()),
  cartTrainingCompletedAt: v.optional(v.number()),
  oseHiringFormCompletedAt: v.optional(v.number()),
  timecardAcknowledgedAt: v.optional(v.number()),
  contractorPayAcknowledgedAt: v.optional(v.number()),
  agreedToOnboardingDocAt: v.optional(v.number()),
  signatureLegalName: v.optional(v.string()),
  completedAt: v.optional(v.number()),
  links: v.any(),
  fwsJobInfo: v.any(),
  profile: v.object({
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    phone: v.optional(v.string()),
    calendarInviteEmail: v.optional(v.string()),
    showOnPublicCrewPage: v.boolean(),
    publicCrewDescription: v.optional(v.string()),
  }),
});

function serializeCrewOnboarding(
  row: CrewOnboardingDoc,
  profile: {
    name: string;
    email: string;
    avatarUrl?: string;
    phone?: string;
    calendarInviteEmail?: string;
    showOnPublicCrewPage: boolean;
    publicCrewDescription?: string;
  },
  payrollMethod: PayrollMethod,
) {
  return {
    status: row.status,
    incompleteStepCount: countIncompleteCrewSteps(row, payrollMethod),
    payrollMethod,
    profileCompletedAt: row.profileCompletedAt,
    whatsappAcknowledgedAt: row.whatsappAcknowledgedAt,
    instagramAcknowledgedAt: row.instagramAcknowledgedAt,
    hasFederalWorkStudy: row.hasFederalWorkStudy,
    fwsAcknowledgedAt: row.fwsAcknowledgedAt,
    narcanCompletedAt: row.narcanCompletedAt,
    soberMonitorCompletedAt: row.soberMonitorCompletedAt,
    emergencySopsAcknowledgedAt: row.emergencySopsAcknowledgedAt,
    crewExpectationsAcknowledgedAt: row.crewExpectationsAcknowledgedAt,
    liftingCompletedAt: row.liftingCompletedAt,
    hasValidDriversLicense: row.hasValidDriversLicense,
    cartTrainingCompletedAt: row.cartTrainingCompletedAt,
    oseHiringFormCompletedAt: row.oseHiringFormCompletedAt,
    timecardAcknowledgedAt: row.timecardAcknowledgedAt,
    contractorPayAcknowledgedAt: row.contractorPayAcknowledgedAt,
    agreedToOnboardingDocAt: row.agreedToOnboardingDocAt,
    signatureLegalName: row.signatureLegalName,
    completedAt: row.completedAt,
    links: ONBOARDING_LINKS,
    fwsJobInfo: FWS_JOB_INFO,
    profile,
  };
}

export const getMyStatus = query({
  args: {},
  returns: v.object({
    crew: v.union(
      v.object({
        status: onboardingStatusValue,
        incompleteStepCount: v.number(),
        applicable: v.literal(true),
      }),
      v.object({ applicable: v.literal(false) }),
    ),
    band: v.union(
      v.object({
        status: onboardingStatusValue,
        applicable: v.literal(true),
        organizationId: v.string(),
      }),
      v.object({ applicable: v.literal(false) }),
    ),
  }),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return await resolveMyOnboardingStatus(ctx, getUserId(user));
  },
});

export const getMyCrewOnboarding = query({
  args: {},
  returns: v.union(crewOnboardingReturn, v.null()),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);

    const memberships = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(50);
    let hasArbor = false;
    for (const membership of memberships) {
      if (!membership.active) continue;
      const type = await resolveOrgType(ctx, membership.organizationId);
      if (type === "arbor_internal") {
        hasArbor = true;
        break;
      }
    }
    if (!hasArbor) return null;

    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const profile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    let avatarUrl: string | undefined;
    if (profile?.avatarStorageId) {
      avatarUrl = (await ctx.storage.getUrl(profile.avatarStorageId)) ?? undefined;
    }
    if (!avatarUrl) {
      avatarUrl = (user as { image?: string | null }).image ?? undefined;
    }

    const profilePayload = {
      name: user.name ?? user.email ?? "User",
      email: user.email ?? "",
      avatarUrl,
      phone: profile?.phone,
      calendarInviteEmail: profile?.calendarInviteEmail,
      showOnPublicCrewPage: profile?.showOnPublicCrewPage ?? false,
      publicCrewDescription: profile?.publicCrewDescription,
    };

    const payrollMethod = normalizePayrollMethod(profile?.payrollMethod);

    // Queries cannot insert; surface a synthetic not_started if missing.
    if (!row) {
      return {
        status: "not_started" as const,
        incompleteStepCount: payrollMethod === "external" ? 10 : 12,
        payrollMethod,
        links: ONBOARDING_LINKS,
        fwsJobInfo: FWS_JOB_INFO,
        profile: profilePayload,
      };
    }

    return serializeCrewOnboarding(row, profilePayload, payrollMethod);
  },
});

export const ensureMyCrewOnboarding = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const memberships = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(50);
    for (const membership of memberships) {
      if (!membership.active) continue;
      const type = await resolveOrgType(ctx, membership.organizationId);
      if (type === "arbor_internal") {
        await ensureCrewOnboarding(ctx, userId);
        return null;
      }
    }
    return null;
  },
});

export const saveCrewProfileStep = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    calendarInviteEmail: v.optional(v.string()),
    showOnPublicCrewPage: v.boolean(),
    publicCrewDescription: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    await ensureCrewOnboarding(ctx, userId);
    const now = Date.now();
    const name = args.name.trim();
    if (!name) throw new Error("Name is required.");
    const phone = args.phone.trim();
    if (!phone) throw new Error("Phone number is required.");
    const calendarInviteEmail = args.calendarInviteEmail?.trim().toLowerCase() || undefined;
    if (calendarInviteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(calendarInviteEmail)) {
      throw new Error("Enter a valid calendar invite email.");
    }

    if (user.email) {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "user",
          where: [{ field: "email", value: user.email }],
          update: { name, updatedAt: now },
        },
      });
    }

    const profile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (profile) {
      await ctx.db.patch(profile._id, {
        phone,
        calendarInviteEmail,
        showOnPublicCrewPage: args.showOnPublicCrewPage,
        publicCrewDescription: args.publicCrewDescription?.trim() || undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userAdminProfiles", {
        userId,
        active: true,
        verticals: [],
        disciplines: [],
        phone,
        calendarInviteEmail,
        showOnPublicCrewPage: args.showOnPublicCrewPage,
        publicCrewDescription: args.publicCrewDescription?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (row && row.status !== "completed" && row.status !== "waived") {
      await ctx.db.patch(row._id, {
        profileCompletedAt: now,
        status: "in_progress",
        updatedAt: now,
      });
    }
    return null;
  },
});

export const saveCrewOnboardingStep = mutation({
  args: {
    whatsappAcknowledged: v.optional(v.boolean()),
    instagramAcknowledged: v.optional(v.boolean()),
    hasFederalWorkStudy: v.optional(v.union(v.boolean(), v.null())),
    fwsAcknowledged: v.optional(v.boolean()),
    narcanCompleted: v.optional(v.boolean()),
    soberMonitorCompleted: v.optional(v.boolean()),
    emergencySopsAcknowledged: v.optional(v.boolean()),
    crewExpectationsAcknowledged: v.optional(v.boolean()),
    liftingCompleted: v.optional(v.boolean()),
    hasValidDriversLicense: v.optional(v.boolean()),
    cartTrainingCompleted: v.optional(v.boolean()),
    oseHiringFormCompleted: v.optional(v.boolean()),
    timecardAcknowledged: v.optional(v.boolean()),
    contractorPayAcknowledged: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    await ensureCrewOnboarding(ctx, userId);
    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!row) throw new Error("Onboarding record missing.");
    if (row.status === "completed" || row.status === "waived") return null;

    const now = Date.now();
    const patch: Partial<CrewOnboardingDoc> = {
      status: "in_progress",
      updatedAt: now,
    };

    if (args.whatsappAcknowledged) patch.whatsappAcknowledgedAt = now;
    if (args.instagramAcknowledged) patch.instagramAcknowledgedAt = now;
    if (args.hasFederalWorkStudy !== undefined) {
      patch.hasFederalWorkStudy = args.hasFederalWorkStudy;
    }
    if (args.fwsAcknowledged) patch.fwsAcknowledgedAt = now;
    if (args.narcanCompleted) patch.narcanCompletedAt = now;
    if (args.soberMonitorCompleted) patch.soberMonitorCompletedAt = now;
    if (args.emergencySopsAcknowledged) patch.emergencySopsAcknowledgedAt = now;
    if (args.crewExpectationsAcknowledged) patch.crewExpectationsAcknowledgedAt = now;
    if (args.liftingCompleted) patch.liftingCompletedAt = now;
    if (args.hasValidDriversLicense !== undefined) {
      patch.hasValidDriversLicense = args.hasValidDriversLicense;
      if (!args.hasValidDriversLicense) {
        patch.cartTrainingCompletedAt = undefined;
      }
    }
    if (args.cartTrainingCompleted) patch.cartTrainingCompletedAt = now;
    if (args.oseHiringFormCompleted) patch.oseHiringFormCompletedAt = now;
    if (args.timecardAcknowledged) patch.timecardAcknowledgedAt = now;
    if (args.contractorPayAcknowledged) patch.contractorPayAcknowledgedAt = now;

    await ctx.db.patch(row._id, patch);
    return null;
  },
});

export const completeCrewOnboarding = mutation({
  args: {
    signatureLegalName: v.string(),
    signatureUserAgent: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!row) throw new Error("Onboarding record missing.");
    if (row.status === "completed" || row.status === "waived") {
      return { ok: true };
    }

    const now = Date.now();
    const signatureLegalName = args.signatureLegalName.trim();
    if (signatureLegalName.length < 2) {
      throw new Error("Enter your full legal name to sign.");
    }

    const next: CrewOnboardingDoc = {
      ...row,
      agreedToOnboardingDocAt: now,
      signatureLegalName,
      signatureUserAgent: args.signatureUserAgent?.trim() || undefined,
    };

    const payrollMethod = await getPayrollMethodForUser(ctx, userId);
    if (!crewRequiredStepsComplete(next, payrollMethod)) {
      throw new Error("Please complete all required onboarding steps before signing.");
    }

    await ctx.db.patch(row._id, {
      agreedToOnboardingDocAt: now,
      signatureLegalName,
      signatureUserAgent: args.signatureUserAgent?.trim() || undefined,
      status: "completed",
      completedAt: now,
      updatedAt: now,
    });

    await scheduleOnboardingCompletedEmails(ctx, {
      userId,
      name: user.name ?? user.email ?? "Crew member",
      email: user.email ?? "",
      hasFederalWorkStudy: row.hasFederalWorkStudy,
      hasValidDriversLicense: row.hasValidDriversLicense,
      signatureLegalName,
    });

    return { ok: true };
  },
});

export const waiveCrewOnboarding = mutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const adminId = getUserId(admin);
    const now = Date.now();
    await ensureCrewOnboarding(ctx, args.userId);
    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!row) return null;
    await ctx.db.patch(row._id, {
      status: "waived",
      waivedAt: now,
      waivedByUserId: adminId,
      updatedAt: now,
    });
    return null;
  },
});

export const listCrewOnboardingForAdmin = query({
  args: {},
  returns: v.array(
    v.object({
      userId: v.string(),
      status: onboardingStatusValue,
      incompleteStepCount: v.number(),
      payrollMethod: v.union(v.literal("stanford"), v.literal("external")),
      hasFederalWorkStudy: v.optional(v.union(v.boolean(), v.null())),
      hasValidDriversLicense: v.optional(v.boolean()),
      signatureLegalName: v.optional(v.string()),
      completedAt: v.optional(v.number()),
      profileCompletedAt: v.optional(v.number()),
      whatsappAcknowledgedAt: v.optional(v.number()),
      instagramAcknowledgedAt: v.optional(v.number()),
      fwsAcknowledgedAt: v.optional(v.number()),
      narcanCompletedAt: v.optional(v.number()),
      soberMonitorCompletedAt: v.optional(v.number()),
      emergencySopsAcknowledgedAt: v.optional(v.number()),
      crewExpectationsAcknowledgedAt: v.optional(v.number()),
      liftingCompletedAt: v.optional(v.number()),
      cartTrainingCompletedAt: v.optional(v.number()),
      oseHiringFormCompletedAt: v.optional(v.number()),
      timecardAcknowledgedAt: v.optional(v.number()),
      contractorPayAcknowledgedAt: v.optional(v.number()),
      agreedToOnboardingDocAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("userOnboarding").withIndex("by_status").take(2000);
    const profiles = await ctx.db.query("userAdminProfiles").withIndex("by_active").take(2000);
    const payrollByUserId = new Map(
      profiles.map((profile) => [profile.userId, normalizePayrollMethod(profile.payrollMethod)]),
    );
    return rows.map((row) => {
      const payrollMethod = payrollByUserId.get(row.userId) ?? "stanford";
      return {
      userId: row.userId,
      status: row.status,
      incompleteStepCount: countIncompleteCrewSteps(row, payrollMethod),
      payrollMethod,
      hasFederalWorkStudy: row.hasFederalWorkStudy,
      hasValidDriversLicense: row.hasValidDriversLicense,
      signatureLegalName: row.signatureLegalName,
      completedAt: row.completedAt,
      profileCompletedAt: row.profileCompletedAt,
      whatsappAcknowledgedAt: row.whatsappAcknowledgedAt,
      instagramAcknowledgedAt: row.instagramAcknowledgedAt,
      fwsAcknowledgedAt: row.fwsAcknowledgedAt,
      narcanCompletedAt: row.narcanCompletedAt,
      soberMonitorCompletedAt: row.soberMonitorCompletedAt,
      emergencySopsAcknowledgedAt: row.emergencySopsAcknowledgedAt,
      crewExpectationsAcknowledgedAt: row.crewExpectationsAcknowledgedAt,
      liftingCompletedAt: row.liftingCompletedAt,
      cartTrainingCompletedAt: row.cartTrainingCompletedAt,
      oseHiringFormCompletedAt: row.oseHiringFormCompletedAt,
      timecardAcknowledgedAt: row.timecardAcknowledgedAt,
      contractorPayAcknowledgedAt: row.contractorPayAcknowledgedAt,
      agreedToOnboardingDocAt: row.agreedToOnboardingDocAt,
    };
    });
  },
});

const bandOnboardingReturn = v.object({
  status: onboardingStatusValue,
  organizationId: v.string(),
  identityCompletedAt: v.optional(v.number()),
  heroCompletedAt: v.optional(v.number()),
  socialsCompletedAt: v.optional(v.number()),
  ratesPayeeCompletedAt: v.optional(v.number()),
  membersCompletedAt: v.optional(v.number()),
  paymentExplainedAt: v.optional(v.number()),
  soloAcknowledgedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
});

export const getMyBandOnboarding = query({
  args: {},
  returns: v.union(bandOnboardingReturn, v.null()),
  handler: async (ctx) => {
    await requireAuth(ctx);
    const orgContext = await getActiveOrganizationContextOrNull(ctx);
    if (!orgContext || (orgContext.organizationType !== "band" && orgContext.organizationType !== "dj")) {
      return null;
    }
    const row = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", orgContext.organizationId))
      .unique();
    if (!row) {
      return {
        status: "not_started" as const,
        organizationId: orgContext.organizationId,
      };
    }
    return {
      status: row.status,
      organizationId: row.organizationId,
      identityCompletedAt: row.identityCompletedAt,
      heroCompletedAt: row.heroCompletedAt,
      socialsCompletedAt: row.socialsCompletedAt,
      ratesPayeeCompletedAt: row.ratesPayeeCompletedAt,
      membersCompletedAt: row.membersCompletedAt,
      paymentExplainedAt: row.paymentExplainedAt,
      soloAcknowledgedAt: row.soloAcknowledgedAt,
      completedAt: row.completedAt,
    };
  },
});

export const saveBandOnboardingStep = mutation({
  args: {
    identityCompleted: v.optional(v.boolean()),
    heroCompleted: v.optional(v.boolean()),
    socialsCompleted: v.optional(v.boolean()),
    ratesPayeeCompleted: v.optional(v.boolean()),
    membersCompleted: v.optional(v.boolean()),
    paymentExplained: v.optional(v.boolean()),
    soloAcknowledged: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const orgContext = await getActiveOrganizationContextOrNull(ctx);
    if (!orgContext || (orgContext.organizationType !== "band" && orgContext.organizationType !== "dj")) {
      throw new Error("Band organization context required.");
    }
    await ensureOrganizationOnboarding(ctx, orgContext.organizationId);
    const row = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", orgContext.organizationId))
      .unique();
    if (!row) throw new Error("Band onboarding record missing.");
    if (row.status === "completed" || row.status === "waived") return null;

    const now = Date.now();
    const patch: Partial<Doc<"organizationOnboarding">> = {
      status: "in_progress",
      updatedAt: now,
    };
    if (args.identityCompleted) patch.identityCompletedAt = now;
    if (args.heroCompleted) patch.heroCompletedAt = now;
    if (args.socialsCompleted) patch.socialsCompletedAt = now;
    if (args.ratesPayeeCompleted) patch.ratesPayeeCompletedAt = now;
    if (args.membersCompleted) patch.membersCompletedAt = now;
    if (args.paymentExplained) patch.paymentExplainedAt = now;
    if (args.soloAcknowledged) {
      patch.soloAcknowledgedAt = now;
      patch.membersCompletedAt = now;
    }

    await ctx.db.patch(row._id, patch);
    return null;
  },
});

export const completeBandOnboarding = mutation({
  args: {},
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx) => {
    await requireAuth(ctx);
    const orgContext = await getActiveOrganizationContextOrNull(ctx);
    if (!orgContext || (orgContext.organizationType !== "band" && orgContext.organizationType !== "dj")) {
      throw new Error("Band organization context required.");
    }
    const row = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", orgContext.organizationId))
      .unique();
    if (!row) throw new Error("Band onboarding record missing.");
    if (row.status === "completed" || row.status === "waived") return { ok: true };

    const membersDone = Boolean(row.membersCompletedAt || row.soloAcknowledgedAt);
    if (
      !row.identityCompletedAt ||
      !row.paymentExplainedAt ||
      !row.ratesPayeeCompletedAt ||
      !membersDone
    ) {
      throw new Error("Complete identity, rates/payee, members, and payment explanation steps first.");
    }

    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const waiveBandOnboarding = mutation({
  args: { organizationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const adminId = getUserId(admin);
    const now = Date.now();
    await ensureOrganizationOnboarding(ctx, args.organizationId);
    const row = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (!row) return null;
    await ctx.db.patch(row._id, {
      status: "waived",
      waivedAt: now,
      waivedByUserId: adminId,
      updatedAt: now,
    });
    return null;
  },
});

export const remindIncomplete = internalMutation({
  args: {},
  returns: v.object({ enqueuedCount: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const incomplete = await ctx.db
      .query("userOnboarding")
      .withIndex("by_status", (q) => q.eq("status", "not_started"))
      .take(500);
    const inProgress = await ctx.db
      .query("userOnboarding")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .take(500);

    const candidates = [...incomplete, ...inProgress];
    let enqueuedCount = 0;
    const allUsersResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: { cursor: null, numItems: 2000 },
    });
    const allUsers = (allUsersResult?.page ?? []) as AuthUser[];
    const userById = new Map(allUsers.map((u) => [getUserId(u), u]));

    for (const row of candidates) {
      if (row.lastReminderSentAt && now - row.lastReminderSentAt < REMINDER_COOLDOWN_MS) {
        continue;
      }
      const authUser = userById.get(row.userId);
      const email = authUser?.email?.trim().toLowerCase();
      if (!email) continue;

      const dayKey = new Date(now).toISOString().slice(0, 10);
      const payrollMethod = await getPayrollMethodForUser(ctx, row.userId);
      await enqueueEmail(ctx, {
        template: "onboarding_reminder",
        to: email,
        subject: subjectForTemplate("onboarding_reminder", "Arbor Live"),
        idempotencyKey: `onboarding_reminder:${row.userId}:${dayKey}`,
        payload: {
          recipientName: authUser?.name ?? undefined,
          onboardingUrl: `${SITE_URL}/onboarding`,
          incompleteStepCount: countIncompleteCrewSteps(row, payrollMethod),
        },
      });
      await ctx.db.patch(row._id, { lastReminderSentAt: now, updatedAt: now });
      enqueuedCount += 1;
    }

    return { enqueuedCount };
  },
});

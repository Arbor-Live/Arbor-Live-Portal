import { hashPassword } from "better-auth/crypto";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  findAuthOrganizationById,
  getActiveOrganizationContextOrNull,
  getCurrentUserOrNull,
  getUserId,
  isAdmin,
  requireAdmin,
  requireArborInternalContext,
  requireAuth,
  requireBandContext,
  type AuthUser,
} from "./lib/auth";
import {
  markInvitationAccepted,
  markInvitationCancelled,
  scheduleUserInviteEmail,
  updatePendingInviteDetails,
} from "./email/invitations";
import { assertUniqueBandPublicSlug, normalizePublicSlug } from "./lib/publicSlug";
import { isBandPayeeComplete } from "./lib/bandPayments";
import { normalizeOptionalAssetReference } from "./lib/inventoryUpload";
import {
  resolveProfileMembership,
  userDisciplineValue,
  userVerticalValue,
  type UserDiscipline,
  type UserVertical,
} from "./lib/userVerticals";
import { ensureOnboardingForOrgMembership, ensureOrganizationOnboarding, resolveMyOnboardingStatus } from "./onboarding";
import {
  applyPayrollMethodToProfile,
  loadInvoiceCrewRateSettings,
  normalizeCompensationRateMode,
  normalizePayrollMethod,
  resolveUserCompensationHourlyRateUsd,
  upsertUserCompensationRate,
  type PayrollMethod,
  type UserCompensationRateMode,
} from "./lib/crewCompensation";

const invitationStatusValue = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("expired"),
  v.literal("cancelled"),
);
const externalOrgRoleValue = v.union(v.literal("org_admin"), v.literal("org_member"));
const userCompensationRateModeValue = v.union(
  v.literal("normal"),
  v.literal("lead"),
  v.literal("custom"),
);
const payrollMethodValue = v.union(v.literal("stanford"), v.literal("external"));

type OrganizationRow = {
  id?: string;
  _id?: string;
  name?: string;
  slug?: string;
  createdAt?: number;
};

type MembershipRow = {
  id?: string;
  _id?: string;
  userId?: string;
  organizationId?: string;
  role?: string;
  createdAt?: number;
};

type InvitationRow = {
  id?: string;
  _id?: string;
  organizationId?: string;
  email?: string;
  role?: string | null;
  status?: string;
  expiresAt?: number;
  createdAt?: number;
  inviterId?: string;
};

export function getAuthRecordId(row: { id?: string; _id?: string } | null | undefined) {
  return getRecordId(row);
}

function getRecordId(row: { id?: string; _id?: string } | null | undefined) {
  return row?.id ?? row?._id ?? "";
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Drain every page of a Better Auth model rather than reading a single fixed
 * page. The previous single-page reads silently truncated once an org grew past
 * the page size (e.g. users beyond 1000 vanished from admin lists); looping the
 * cursor keeps these admin-only reads complete. Bounded by `maxPages` as a
 * runaway guard.
 */
async function fetchAllBetterAuthRows<T>(
  ctx: QueryCtx | MutationCtx,
  model: "user" | "organization",
  pageSize: number,
  maxPages = 50,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model,
      paginationOpts: { cursor, numItems: pageSize },
    });
    rows.push(...((result?.page ?? []) as T[]));
    if (result?.isDone || !result?.continueCursor) break;
    cursor = result.continueCursor as string;
  }
  return rows;
}

async function getAllAuthUsers(ctx: QueryCtx | MutationCtx) {
  return await fetchAllBetterAuthRows<AuthUser>(ctx, "user", 500);
}

async function getAllOrganizations(ctx: QueryCtx | MutationCtx) {
  return await fetchAllBetterAuthRows<OrganizationRow>(ctx, "organization", 500);
}

async function getOrganizationById(ctx: QueryCtx | MutationCtx, organizationId: string) {
  return await findAuthOrganizationById(ctx, organizationId);
}

export async function resolveOrCreateOrganization(ctx: MutationCtx, name: string) {
  const slug = toSlug(name);
  const existing = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "organization",
    where: [{ field: "slug", value: slug }],
  })) as OrganizationRow | null;
  if (existing) return { id: getRecordId(existing), name: existing.name ?? name, slug };
  const now = Date.now();
  const created = (await ctx.runMutation(components.betterAuth.adapter.create, {
    input: {
      model: "organization",
      data: {
        name,
        slug,
        createdAt: now,
      },
    },
  })) as OrganizationRow;
  return { id: getRecordId(created), name, slug };
}

function resolveOrganizationType(
  organization: OrganizationRow | undefined,
  profile?: { organizationType: "arbor_internal" | "band" | "dj" } | null,
): "arbor_internal" | "band" | "dj" {
  if (isArborOrganization(organization)) return "arbor_internal";
  return profile?.organizationType ?? "band";
}

export async function ensureUserProfileDefaults(
  ctx: MutationCtx,
  userId: string,
  {
    title,
    phone,
    active = true,
    verticals = [],
    disciplines = [],
    showOnPublicCrewPage,
    publicCrewDescription,
    payrollMethod,
    defaultOrganizationId,
    gradYear,
  }: {
    title?: string;
    phone?: string;
    active?: boolean;
    verticals?: UserVertical[];
    disciplines?: UserDiscipline[];
    showOnPublicCrewPage?: boolean;
    publicCrewDescription?: string;
    payrollMethod?: PayrollMethod;
    defaultOrganizationId?: string;
    gradYear?: number;
  },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  const normalizedDescription = publicCrewDescription?.trim() || undefined;
  if (existing) {
    await ctx.db.patch(existing._id, {
      title: title ?? existing.title,
      phone: phone ?? existing.phone,
      active,
      verticals,
      disciplines,
      showOnPublicCrewPage:
        showOnPublicCrewPage !== undefined ? showOnPublicCrewPage : existing.showOnPublicCrewPage,
      publicCrewDescription:
        publicCrewDescription !== undefined ? normalizedDescription : existing.publicCrewDescription,
      payrollMethod: payrollMethod ?? existing.payrollMethod,
      defaultOrganizationId: defaultOrganizationId ?? existing.defaultOrganizationId,
      gradYear: gradYear ?? existing.gradYear,
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("userAdminProfiles", {
    userId,
    title,
    phone,
    active,
    verticals,
    disciplines,
    showOnPublicCrewPage,
    publicCrewDescription: normalizedDescription,
    payrollMethod,
    defaultOrganizationId,
    gradYear,
    createdAt: now,
    updatedAt: now,
  });
}

async function assertArborCrewInviteCompensation(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  args: {
    rateMode?: UserCompensationRateMode;
    customHourlyRateUsd?: number;
    payrollMethod?: PayrollMethod;
  },
) {
  const orgProfile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  const organizations = await getAllOrganizations(ctx);
  const org = organizations.find((entry) => getRecordId(entry) === organizationId);
  const isArbor =
    orgProfile?.organizationType === "arbor_internal" || isArborOrganization(org);
  if (!isArbor) {
    return { isArbor: false as const };
  }
  if (!args.rateMode) {
    throw new Error("Rate mode is required for Arbor Live crew invites.");
  }
  if (!args.payrollMethod) {
    throw new Error("Payment method is required for Arbor Live crew invites.");
  }
  if (args.rateMode === "custom") {
    if (args.customHourlyRateUsd === undefined || args.customHourlyRateUsd < 0) {
      throw new Error("Custom hourly rate is required.");
    }
  }
  return {
    isArbor: true as const,
    rateMode: args.rateMode,
    customHourlyRateUsd: args.customHourlyRateUsd,
    payrollMethod: args.payrollMethod,
  };
}

async function applyCrewCompensationAndPayroll(
  ctx: MutationCtx,
  args: {
    userId: string;
    rateMode: UserCompensationRateMode;
    customHourlyRateUsd?: number;
    payrollMethod: PayrollMethod;
    updatedByUserId?: string;
  },
) {
  await upsertUserCompensationRate(ctx, {
    userId: args.userId,
    rateMode: args.rateMode,
    hourlyRateUsd: args.rateMode === "custom" ? args.customHourlyRateUsd : 0,
    updatedByUserId: args.updatedByUserId,
  });
  await applyPayrollMethodToProfile(ctx, args.userId, args.payrollMethod);
}

function isArborOrganization(org: OrganizationRow | undefined) {
  if (!org) return false;
  const name = (org.name ?? "").trim().toLowerCase();
  const slug = (org.slug ?? "").trim().toLowerCase();
  return name === "arbor live" || slug === "arbor-live";
}

async function normalizeMembershipRole(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  role: string | undefined,
) {
  const organizations = await getAllOrganizations(ctx);
  const org = organizations.find((entry) => getRecordId(entry) === organizationId);
  const requested = (role ?? "").trim();
  if (!org) return requested || "org_member";
  if (isArborOrganization(org)) {
    return requested || "member";
  }
  if (requested === "org_admin" || requested === "org_member") {
    return requested;
  }
  if (!requested || requested === "admin") return "org_admin";
  return "org_member";
}

export async function upsertOrgMembership(
  ctx: MutationCtx,
  args: {
    userId: string;
    organizationId: string;
    role: string;
    active: boolean;
    bandRole?: string;
  },
) {
  const now = Date.now();
  const bandRole = args.bandRole?.trim() || undefined;
  const existing = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_userId_and_organizationId", (q) =>
      q.eq("userId", args.userId).eq("organizationId", args.organizationId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      role: args.role,
      active: args.active,
      ...(args.bandRole !== undefined ? { bandRole } : {}),
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("userOrganizationMemberships", {
    userId: args.userId,
    organizationId: args.organizationId,
    role: args.role,
    bandRole,
    active: args.active,
    createdAt: now,
    updatedAt: now,
  });
}

export const listOrganizationsAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const organizations = await getAllOrganizations(ctx);
    const orgProfiles = await ctx.db.query("organizationProfiles").withIndex("by_organizationType").take(500);
    const profileByOrgId = new Map(orgProfiles.map((row) => [row.organizationId, row]));
    return organizations
      .map((org) => ({
        id: getRecordId(org),
        name: org.name ?? "Unnamed organization",
        slug: org.slug ?? "",
        organizationType: resolveOrganizationType(org, profileByOrgId.get(getRecordId(org))),
        archived: profileByOrgId.get(getRecordId(org))?.status === "archived",
      }))
      .filter((org) => Boolean(org.id) && !org.archived)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listBandOrganizationsAdmin = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const organizations = await getAllOrganizations(ctx);
    const profiles = await ctx.db.query("organizationProfiles").withIndex("by_organizationType").take(1000);
    const profileByOrgId = new Map(profiles.map((profile) => [profile.organizationId, profile]));
    return organizations
      .map((organization) => {
        const organizationId = getRecordId(organization);
        const profile = profileByOrgId.get(organizationId);
        const inferredType = resolveOrganizationType(organization, profile);
        return {
          organizationId,
          name: organization.name ?? "Organization",
          slug: organization.slug ?? "",
          organizationType: inferredType,
          displayName: profile?.displayName ?? organization.name ?? "",
          bio: profile?.bio ?? "",
          status: profile?.status === "archived" ? "archived" : "active",
          performerHourlyRateUsd: profile?.performerHourlyRateUsd ?? 0,
          designatedPayeeUserId: profile?.designatedPayeeUserId ?? "",
          designatedPayeeName: profile?.designatedPayeeName ?? "",
          designatedPayeeEmail: profile?.designatedPayeeEmail ?? "",
          designatedPayeeMailingAddress: profile?.designatedPayeeMailingAddress ?? "",
          designatedPayeePayoutMethod:
            profile?.designatedPayeePayoutMethod === "pickup" ||
            profile?.designatedPayeePayoutMethod === "delivery"
              ? profile.designatedPayeePayoutMethod
              : "",
          publicWebsiteUrl: profile?.publicWebsiteUrl ?? "",
          publicInstagramUrl: profile?.publicInstagramUrl ?? "",
          publicYoutubeUrl: profile?.publicYoutubeUrl ?? "",
          publicSpotifyUrl: profile?.publicSpotifyUrl ?? "",
          publicListing: profile?.publicListing ?? false,
          publicSlug: profile?.publicSlug ?? "",
          publicHeroImageUrl: profile?.publicHeroImageUrl ?? "",
        };
      })
      .filter((organization) => organization.organizationType === "band" || organization.organizationType === "dj")
      .filter((organization) => args.includeArchived || organization.status !== "archived")
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Slim band/DJ catalog for invoice artist lines (Arbor staff, not admin-only). */
export const listBandsForInvoiceLines = query({
  args: {},
  returns: v.array(
    v.object({
      organizationId: v.string(),
      name: v.string(),
      performerHourlyRateUsd: v.number(),
      memberCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const organizations = await getAllOrganizations(ctx);
    const profiles = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationType")
      .take(1000);
    const profileByOrgId = new Map(profiles.map((profile) => [profile.organizationId, profile]));
    return organizations
      .map((organization) => {
        const organizationId = getRecordId(organization);
        const profile = profileByOrgId.get(organizationId);
        const inferredType = resolveOrganizationType(organization, profile);
        const status = profile?.status === "archived" ? "archived" : "active";
        const memberCount = profile?.bandMembers?.length ?? 0;
        return {
          organizationId,
          name: (profile?.displayName ?? organization.name ?? "Band").trim() || "Band",
          organizationType: inferredType,
          status,
          performerHourlyRateUsd: profile?.performerHourlyRateUsd ?? 0,
          memberCount,
        };
      })
      .filter(
        (organization) =>
          (organization.organizationType === "band" || organization.organizationType === "dj") &&
          organization.status !== "archived",
      )
      .map(({ organizationId, name, performerHourlyRateUsd, memberCount }) => ({
        organizationId,
        name,
        performerHourlyRateUsd,
        memberCount,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const updateBandOrganizationProfileAdmin = mutation({
  args: {
    organizationId: v.string(),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    performerHourlyRateUsd: v.optional(v.number()),
    designatedPayeeUserId: v.optional(v.string()),
    designatedPayeeName: v.optional(v.string()),
    designatedPayeeEmail: v.optional(v.string()),
    designatedPayeeMailingAddress: v.optional(v.string()),
    designatedPayeePayoutMethod: v.optional(
      v.union(v.literal("pickup"), v.literal("delivery")),
    ),
    publicWebsiteUrl: v.optional(v.string()),
    publicInstagramUrl: v.optional(v.string()),
    publicYoutubeUrl: v.optional(v.string()),
    publicSpotifyUrl: v.optional(v.string()),
    publicListing: v.optional(v.boolean()),
    publicSlug: v.optional(v.string()),
    publicHeroImageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const organizations = await getAllOrganizations(ctx);
    const organization = organizations.find((entry) => getRecordId(entry) === args.organizationId);
    if (!organization) throw new Error("Organization not found.");
    if (isArborOrganization(organization)) {
      throw new Error("Use band org profile editor only for band organizations.");
    }
    if (args.performerHourlyRateUsd !== undefined && args.performerHourlyRateUsd < 0) {
      throw new Error("Performer hourly rate must be 0 or greater.");
    }

    const publicSlug =
      args.publicSlug === undefined ? undefined : normalizePublicSlug(args.publicSlug);
    if (publicSlug) {
      await assertUniqueBandPublicSlug(ctx, publicSlug, args.organizationId);
    }
    const publicListing = args.publicListing;
    if (publicListing && !publicSlug) {
      throw new Error("Public slug is required when enabling public artist listing.");
    }

    const existing = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        organizationType: existing.organizationType ?? "band",
        displayName: args.displayName?.trim() || undefined,
        bio: args.bio?.trim() || undefined,
        performerHourlyRateUsd: args.performerHourlyRateUsd ?? existing.performerHourlyRateUsd,
        designatedPayeeUserId:
          args.designatedPayeeUserId !== undefined
            ? args.designatedPayeeUserId.trim() || undefined
            : existing.designatedPayeeUserId,
        designatedPayeeName:
          args.designatedPayeeName !== undefined
            ? args.designatedPayeeName.trim() || undefined
            : existing.designatedPayeeName,
        designatedPayeeEmail:
          args.designatedPayeeEmail !== undefined
            ? args.designatedPayeeEmail.trim().toLowerCase() || undefined
            : existing.designatedPayeeEmail,
        designatedPayeeMailingAddress:
          args.designatedPayeeMailingAddress !== undefined
            ? args.designatedPayeeMailingAddress.trim() || undefined
            : existing.designatedPayeeMailingAddress,
        designatedPayeePayoutMethod:
          args.designatedPayeePayoutMethod !== undefined
            ? args.designatedPayeePayoutMethod
            : existing.designatedPayeePayoutMethod,
        publicWebsiteUrl: args.publicWebsiteUrl?.trim() || undefined,
        publicInstagramUrl: args.publicInstagramUrl?.trim() || undefined,
        publicYoutubeUrl: args.publicYoutubeUrl?.trim() || undefined,
        publicSpotifyUrl: args.publicSpotifyUrl?.trim() || undefined,
        publicListing: publicListing ?? existing.publicListing,
        publicSlug: publicSlug ?? (publicListing === false ? undefined : existing.publicSlug),
        publicHeroImageUrl: normalizeOptionalAssetReference(args.publicHeroImageUrl),
        updatedAt: now,
      });
      await ctx.runMutation(internal.bandPayments.refreshPendingPayeePaymentsForOrg, {
        organizationId: args.organizationId,
      });
      return existing._id;
    }
    const profileId = await ctx.db.insert("organizationProfiles", {
      organizationId: args.organizationId,
      organizationType: "band",
      displayName: args.displayName?.trim() || organization.name || "Band",
      bio: args.bio?.trim() || undefined,
      performerHourlyRateUsd: args.performerHourlyRateUsd,
      designatedPayeeUserId: args.designatedPayeeUserId?.trim() || undefined,
      designatedPayeeName: args.designatedPayeeName?.trim() || undefined,
      designatedPayeeEmail: args.designatedPayeeEmail?.trim().toLowerCase() || undefined,
      designatedPayeeMailingAddress: args.designatedPayeeMailingAddress?.trim() || undefined,
      designatedPayeePayoutMethod: args.designatedPayeePayoutMethod,
      publicWebsiteUrl: args.publicWebsiteUrl?.trim() || undefined,
      publicInstagramUrl: args.publicInstagramUrl?.trim() || undefined,
      publicYoutubeUrl: args.publicYoutubeUrl?.trim() || undefined,
      publicSpotifyUrl: args.publicSpotifyUrl?.trim() || undefined,
      publicListing: publicListing ?? false,
      publicSlug: publicListing ? publicSlug : undefined,
      publicHeroImageUrl: normalizeOptionalAssetReference(args.publicHeroImageUrl),
      updatedAt: now,
    });
    await ctx.runMutation(internal.bandPayments.refreshPendingPayeePaymentsForOrg, {
      organizationId: args.organizationId,
    });
    return profileId;
  },
});

/**
 * Deactivates every membership on `organizationId`, then deactivates (bans)
 * any affected user who is left with zero remaining active memberships
 * anywhere. Platform admins are never auto-banned by this path. Returns the
 * user ids that were deactivated.
 */
async function deactivateOrgMembers(
  ctx: MutationCtx,
  organizationId: string,
  now: number,
): Promise<string[]> {
  const memberships = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(1000);
  const affectedUserIds = new Set<string>();
  for (const membership of memberships) {
    if (membership.active) {
      await ctx.db.patch(membership._id, { active: false, updatedAt: now });
    }
    affectedUserIds.add(membership.userId);
  }
  if (affectedUserIds.size === 0) return [];

  const users = await getAllAuthUsers(ctx);
  const userByAuthId = new Map(users.map((user) => [getUserId(user), user]));
  const deactivatedUserIds: string[] = [];

  for (const userId of affectedUserIds) {
    const remainingActive = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("active"), true))
      .first();
    if (remainingActive) continue;

    const target = userByAuthId.get(userId);
    if (target?.email && !target.banned && !isAdmin(target)) {
      await setAuthUserBanState(ctx, target.email, true, now);
    }

    const existingProfile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existingProfile?.active !== false) {
      const existingMembership = existingProfile
        ? resolveProfileMembership(existingProfile)
        : { verticals: [], disciplines: [] };
      await ensureUserProfileDefaults(ctx, userId, {
        title: existingProfile?.title,
        phone: existingProfile?.phone,
        active: false,
        verticals: existingMembership.verticals,
        disciplines: existingMembership.disciplines,
        showOnPublicCrewPage: existingProfile?.showOnPublicCrewPage,
        publicCrewDescription: existingProfile?.publicCrewDescription,
        defaultOrganizationId: existingProfile?.defaultOrganizationId,
      });
    }
    deactivatedUserIds.push(userId);
  }
  return deactivatedUserIds;
}

async function clearActiveOrgSelections(ctx: MutationCtx, organizationId: string) {
  const activeSelections = await ctx.db
    .query("userActiveOrganizations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(1000);
  for (const selection of activeSelections) {
    await ctx.db.delete(selection._id);
  }
}

export const archiveBandOrganizationAdmin = mutation({
  args: { organizationId: v.string() },
  returns: v.object({ ok: v.boolean(), deactivatedUserIds: v.array(v.string()) }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const organizations = await getAllOrganizations(ctx);
    const organization = organizations.find((entry) => getRecordId(entry) === args.organizationId);
    if (!organization) throw new Error("Organization not found.");
    if (isArborOrganization(organization)) {
      throw new Error("The Arbor Live organization cannot be archived.");
    }
    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (!profile || (profile.organizationType !== "band" && profile.organizationType !== "dj")) {
      throw new Error("Only band/DJ organizations can be archived.");
    }
    if (profile.status === "archived") {
      return { ok: true, deactivatedUserIds: [] };
    }

    await ctx.db.patch(profile._id, {
      status: "archived",
      publicListing: false,
      publicSlug: undefined,
      updatedAt: now,
    });

    const deactivatedUserIds = await deactivateOrgMembers(ctx, args.organizationId, now);
    await clearActiveOrgSelections(ctx, args.organizationId);

    return { ok: true, deactivatedUserIds };
  },
});

export const unarchiveBandOrganizationAdmin = mutation({
  args: { organizationId: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (!profile) throw new Error("Organization profile not found.");
    await ctx.db.patch(profile._id, { status: "active", updatedAt: Date.now() });
    return { ok: true };
  },
});

export const deleteArchivedBandOrganizationAdmin = mutation({
  args: { organizationId: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (!profile) throw new Error("Organization profile not found.");
    if (profile.status !== "archived") {
      throw new Error("Only archived organizations can be deleted. Archive it first.");
    }

    // Safety net in case memberships were added back after archiving.
    await deactivateOrgMembers(ctx, args.organizationId, now);

    const memberships = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .take(1000);
    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }

    const onboardingRows = await ctx.db
      .query("organizationOnboarding")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .take(10);
    for (const row of onboardingRows) {
      await ctx.db.delete(row._id);
    }

    const participations = await ctx.db
      .query("eventBandParticipations")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .take(1000);
    for (const row of participations) {
      await ctx.db.delete(row._id);
    }

    await clearActiveOrgSelections(ctx, args.organizationId);
    await ctx.db.delete(profile._id);

    // Best-effort Better Auth cascade — never block the Convex-side delete on it.
    try {
      await ctx.runMutation(components.betterAuth.adapter.deleteMany as any, {
        input: {
          model: "member",
          where: [{ field: "organizationId", value: args.organizationId }],
        },
      });
    } catch {
      // ignore
    }
    try {
      await ctx.runMutation(components.betterAuth.adapter.deleteMany as any, {
        input: {
          model: "invitation",
          where: [{ field: "organizationId", value: args.organizationId }],
        },
      });
    } catch {
      // ignore
    }
    try {
      await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: {
          model: "organization",
          where: [{ field: "_id", value: args.organizationId }],
        },
      });
    } catch {
      // ignore
    }

    return { ok: true };
  },
});

export const createOrganizationAdmin = mutation({
  args: { name: v.string(), organizationType: v.optional(v.union(v.literal("arbor_internal"), v.literal("band"), v.literal("dj"))) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const orgName = args.name.trim();
    if (!orgName) throw new Error("Organization name is required.");
    const resolved = await resolveOrCreateOrganization(ctx, orgName);
    const now = Date.now();
    const orgType = args.organizationType ?? (resolved.slug === "arbor-live" ? "arbor_internal" : "band");
    const existingProfile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", resolved.id))
      .unique();
    if (existingProfile) {
      await ctx.db.patch(existingProfile._id, {
        organizationType: orgType,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("organizationProfiles", {
        organizationId: resolved.id,
        organizationType: orgType,
        displayName: resolved.name,
        updatedAt: now,
      });
    }
    if (orgType === "band" || orgType === "dj") {
      await ensureOrganizationOnboarding(ctx, resolved.id);
    }
    return { ...resolved, organizationType: orgType };
  },
});

export const listMyOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const memberships = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(200);
    const activeMemberships = memberships.filter((row) => row.active);
    const organizations = await Promise.all(
      activeMemberships.map(async (membership) => {
        const profile = await ctx.db
          .query("organizationProfiles")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", membership.organizationId),
          )
          .unique();
        if (profile?.organizationType === "arbor_internal") {
          return {
            organizationId: membership.organizationId,
            name: "Arbor Live",
            slug: "arbor-live",
            role: membership.role,
            organizationType: "arbor_internal" as const,
          };
        }
        const organization = await getOrganizationById(ctx, membership.organizationId);
        return {
          organizationId: membership.organizationId,
          name: organization?.name ?? "Organization",
          slug: organization?.slug ?? "",
          role: membership.role,
          organizationType: resolveOrganizationType(organization ?? undefined, profile),
        };
      }),
    );
    return organizations.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getViewer = query({
  args: {},
  returns: v.union(
    v.object({
      userId: v.string(),
      role: v.optional(v.string()),
      isAdmin: v.boolean(),
      isCrewOnly: v.boolean(),
      verticals: v.array(userVerticalValue),
      disciplines: v.array(userDisciplineValue),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    // Return null for guests instead of throwing — public surfaces (e.g. booking
    // VenuePicker) may subscribe without auth, and Convex React surfaces thrown
    // query errors as uncaught render failures.
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;
    const userId = getUserId(user);
    const orgContext = await getActiveOrganizationContextOrNull(ctx);
    const profile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const membership = resolveProfileMembership(profile ?? {});
    return {
      userId,
      role: user.role ?? undefined,
      isAdmin: isAdmin(user),
      isCrewOnly: !isAdmin(user) && orgContext?.organizationType === "arbor_internal",
      verticals: membership.verticals,
      disciplines: membership.disciplines,
    };
  },
});

const onboardingStatusValue = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("waived"),
);

/**
 * One auth-resolved payload for shell chrome (sidebar + onboarding banner).
 * Prefer this over stacking getViewer + getMyAccount + getMyStatus +
 * getActiveOrganization + listMyOrganizations.
 */
export const getSessionShell = query({
  args: {},
  returns: v.union(
    v.object({
      viewer: v.object({
        userId: v.string(),
        role: v.optional(v.string()),
        isAdmin: v.boolean(),
        isCrewOnly: v.boolean(),
        verticals: v.array(userVerticalValue),
        disciplines: v.array(userDisciplineValue),
      }),
      account: v.object({
        name: v.string(),
        email: v.string(),
        image: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
      }),
      onboarding: v.object({
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
      activeOrganization: v.union(
        v.object({
          organizationId: v.string(),
          name: v.string(),
          slug: v.string(),
          role: v.string(),
          organizationType: v.optional(v.string()),
        }),
        v.null(),
      ),
      organizations: v.array(
        v.object({
          organizationId: v.string(),
          name: v.string(),
          slug: v.string(),
          role: v.string(),
          organizationType: v.optional(v.string()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;
    const userId = getUserId(user);
    const orgContext = await getActiveOrganizationContextOrNull(ctx);
    const profile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const membership = resolveProfileMembership(profile ?? {});

    let avatarUrl: string | undefined;
    if (profile?.avatarStorageId) {
      avatarUrl = (await ctx.storage.getUrl(profile.avatarStorageId)) ?? undefined;
    }

    const [onboarding, memberships] = await Promise.all([
      resolveMyOnboardingStatus(ctx, userId),
      ctx.db
        .query("userOrganizationMemberships")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(200),
    ]);

    const activeMemberships = memberships.filter((row) => row.active);
    const organizations = (
      await Promise.all(
        activeMemberships.map(async (row) => {
          const [organization, orgProfile] = await Promise.all([
            getOrganizationById(ctx, row.organizationId),
            ctx.db
              .query("organizationProfiles")
              .withIndex("by_organizationId", (q) => q.eq("organizationId", row.organizationId))
              .unique(),
          ]);
          return {
            organizationId: row.organizationId,
            name: organization?.name ?? "Organization",
            slug: organization?.slug ?? "",
            role: row.role,
            organizationType: resolveOrganizationType(organization ?? undefined, orgProfile),
          };
        }),
      )
    ).sort((a, b) => a.name.localeCompare(b.name));

    const activeOrganization =
      (orgContext
        ? organizations.find((org) => org.organizationId === orgContext.organizationId)
        : undefined) ??
      organizations[0] ??
      null;

    return {
      viewer: {
        userId,
        role: user.role ?? undefined,
        isAdmin: isAdmin(user),
        isCrewOnly: !isAdmin(user) && orgContext?.organizationType === "arbor_internal",
        verticals: membership.verticals,
        disciplines: membership.disciplines,
      },
      account: {
        name: user.name ?? user.email ?? "User",
        email: user.email ?? "",
        image: (user as { image?: string | null }).image ?? undefined,
        avatarUrl,
      },
      onboarding,
      activeOrganization,
      organizations,
    };
  },
});

export const getActiveOrganization = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const activeRow = await ctx.db
      .query("userActiveOrganizations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const memberships = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(200);
    const membership = memberships.find((row) => row.active && row.organizationId === activeRow?.organizationId) ??
      memberships.find((row) => row.active);
    if (!membership) return null;

    // Local profile first — avoids a Better Auth org round-trip for arbor_internal
    // (same path requireArborInternalContext uses). Previously this also called
    // getOrganizationType which re-fetched the org a second time.
    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", membership.organizationId),
      )
      .unique();
    if (profile?.organizationType === "arbor_internal") {
      return {
        organizationId: membership.organizationId,
        name: "Arbor Live",
        slug: "arbor-live",
        role: membership.role,
        organizationType: "arbor_internal" as const,
      };
    }

    const organization = await getOrganizationById(ctx, membership.organizationId);
    return {
      organizationId: membership.organizationId,
      name: organization?.name ?? "Organization",
      slug: organization?.slug ?? "",
      role: membership.role,
      organizationType: resolveOrganizationType(organization ?? undefined, profile),
    };
  },
});

export const setActiveOrganization = mutation({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const membership = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", userId).eq("organizationId", args.organizationId),
      )
      .unique();
    if (!membership || !membership.active) {
      throw new Error("You are not an active member of this organization.");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("userActiveOrganizations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { organizationId: args.organizationId, updatedAt: now });
    } else {
      await ctx.db.insert("userActiveOrganizations", { userId, organizationId: args.organizationId, updatedAt: now });
    }
    return { ok: true };
  },
});

export const listWithRates = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await getAllAuthUsers(ctx);
    const rates = await ctx.db.query("userCompensationRates").withIndex("by_updatedAt").take(1000);
    const settings = await loadInvoiceCrewRateSettings(ctx);
    const rateByUserId = new Map(
      rates.map((rate) => [
        rate.userId,
        {
          rateMode: normalizeCompensationRateMode(rate.rateMode),
          customHourlyRateUsd: rate.hourlyRateUsd,
          hourlyRateUsd: resolveUserCompensationHourlyRateUsd(rate, settings),
        },
      ]),
    );
    const profiles = await ctx.db.query("userAdminProfiles").withIndex("by_active").take(2000);
    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
    return users
      .map((user) => {
        const id = getUserId(user);
        const rate = rateByUserId.get(id);
        return {
          id,
          name: user.name ?? user.email ?? "Unknown user",
          email: user.email ?? "",
          role: user.role ?? "",
          rateMode: rate?.rateMode ?? null,
          customHourlyRateUsd: rate?.customHourlyRateUsd ?? null,
          hourlyRateUsd: rate?.hourlyRateUsd ?? null,
          payrollMethod: normalizePayrollMethod(profileByUserId.get(id)?.payrollMethod),
        };
      })
      .filter((user) => Boolean(user.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listUsersForAdmin = query({
  args: {
    organizationId: v.optional(v.string()),
    search: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const users = await getAllAuthUsers(ctx);
    const organizations = await getAllOrganizations(ctx);
    const organizationById = new Map(organizations.map((org) => [getRecordId(org), org]));
    const rates = await ctx.db.query("userCompensationRates").withIndex("by_updatedAt").take(1000);
    const settings = await loadInvoiceCrewRateSettings(ctx);
    const rateByUserId = new Map(
      rates.map((rate) => [
        rate.userId,
        {
          rateMode: normalizeCompensationRateMode(rate.rateMode),
          customHourlyRateUsd: rate.hourlyRateUsd,
          hourlyRateUsd: resolveUserCompensationHourlyRateUsd(rate, settings),
        },
      ]),
    );
    const profiles = await ctx.db.query("userAdminProfiles").withIndex("by_active").take(2000);
    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
    const orgMemberships = await ctx.db.query("userOrganizationMemberships").withIndex("by_userId").take(5000);
    const membershipsByUserId = new Map<string, typeof orgMemberships>();
    for (const membership of orgMemberships) {
      const list = membershipsByUserId.get(membership.userId) ?? [];
      list.push(membership);
      membershipsByUserId.set(membership.userId, list);
    }

    const search = args.search?.trim().toLowerCase();
    return users
      .map((user) => {
        const id = getUserId(user);
        const profile = profileByUserId.get(id);
        const rate = rateByUserId.get(id);
        const memberships = (membershipsByUserId.get(id) ?? [])
          .map((membership) => ({
            organizationId: membership.organizationId,
            organizationName:
              organizationById.get(membership.organizationId)?.name ?? membership.organizationId,
            role: membership.role,
            active: membership.active,
          }))
          .sort((a, b) => a.organizationName.localeCompare(b.organizationName));
        const membership = resolveProfileMembership(profile ?? {});
        return {
          id,
          name: user.name ?? user.email ?? "Unknown user",
          email: user.email ?? "",
          role: user.role ?? "member",
          banned: Boolean(user.banned),
          active: profile?.active ?? true,
          phone: profile?.phone ?? "",
          title: profile?.title ?? "",
          verticals: membership.verticals,
          disciplines: membership.disciplines,
          showOnPublicCrewPage: profile?.showOnPublicCrewPage ?? false,
          publicCrewDescription: profile?.publicCrewDescription ?? "",
          defaultOrganizationId: profile?.defaultOrganizationId ?? "",
          organizationMemberships: memberships,
          rateMode: rate?.rateMode ?? null,
          customHourlyRateUsd: rate?.customHourlyRateUsd ?? null,
          hourlyRateUsd: rate?.hourlyRateUsd ?? null,
          payrollMethod: normalizePayrollMethod(profile?.payrollMethod),
        };
      })
      .filter((user) => {
        if (!user.id) return false;
        if (args.activeOnly && !user.active) return false;
        if (args.organizationId) {
          const inOrg = user.organizationMemberships.some(
            (membership) => membership.organizationId === args.organizationId && membership.active,
          );
          if (!inOrg) return false;
        }
        if (!search) return true;
        const haystack = [
          user.name,
          user.email,
          user.role,
          user.phone,
          user.verticals.join(" "),
          user.disciplines.join(" "),
          user.organizationMemberships.map((row) => row.organizationName).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listInvitationsAdmin = query({
  args: { organizationId: v.optional(v.string()), status: v.optional(invitationStatusValue) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const orgs = await getAllOrganizations(ctx);
    const orgById = new Map(orgs.map((org) => [getRecordId(org), org]));
    const inviterUsers = await getAllAuthUsers(ctx);
    const inviterById = new Map(inviterUsers.map((user) => [getUserId(user), user]));
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "invitation",
      paginationOpts: { cursor: null, numItems: 2000 },
    });
    const invites = (result?.page ?? []) as InvitationRow[];
    const pendingInvites = await ctx.db.query("pendingUserInvites").take(2000);
    const pendingByInvitationId = new Map(
      pendingInvites.map((row) => [row.invitationId, row]),
    );
    return invites
      .map((invite) => {
        const inviteId = getRecordId(invite);
        const pending = pendingByInvitationId.get(inviteId);
        return {
          id: inviteId,
          email: invite.email ?? "",
          role: invite.role ?? "member",
          status: invite.status ?? "pending",
          organizationId: invite.organizationId ?? "",
          organizationName: orgById.get(invite.organizationId ?? "")?.name ?? "Unknown organization",
          inviterName:
            inviterById.get(invite.inviterId ?? "")?.name ??
            inviterById.get(invite.inviterId ?? "")?.email ??
            invite.inviterId ??
            "Unknown",
          createdAt: invite.createdAt ?? 0,
          expiresAt: invite.expiresAt ?? 0,
          teams: (pending?.teams ?? []) as string[],
          verticals: (pending?.verticals ?? []) as UserVertical[],
          disciplines: (pending?.disciplines ?? []) as UserDiscipline[],
        };
      })
      .filter((invite) => Boolean(invite.id))
      .filter((invite) => (args.organizationId ? invite.organizationId === args.organizationId : true))
      .filter((invite) => (args.status ? invite.status === args.status : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const inviteUserAdmin = mutation({
  args: {
    organizationId: v.string(),
    email: v.string(),
    role: v.optional(v.string()),
    verticals: v.optional(v.array(userVerticalValue)),
    disciplines: v.optional(v.array(userDisciplineValue)),
    rateMode: v.optional(userCompensationRateModeValue),
    customHourlyRateUsd: v.optional(v.number()),
    payrollMethod: v.optional(payrollMethodValue),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const adminId = getUserId(admin);
    if (!adminId) throw new Error("Unable to resolve current admin user.");
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
    const now = Date.now();
    const expiresAt = now + 14 * 24 * 60 * 60 * 1000;

    const crewInvite = await assertArborCrewInviteCompensation(ctx, args.organizationId, {
      rateMode: args.rateMode,
      customHourlyRateUsd: args.customHourlyRateUsd,
      payrollMethod: args.payrollMethod,
    });

    const membershipRole = await normalizeMembershipRole(ctx, args.organizationId, args.role ?? "member");
    const created = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "invitation",
        data: {
          organizationId: args.organizationId,
          email,
          role: membershipRole,
          status: "pending",
          expiresAt,
          createdAt: now,
          inviterId: adminId,
        },
      },
    })) as InvitationRow;

    const existingUser = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    })) as AuthUser | null;
    const existingUserId = existingUser ? getUserId(existingUser) : "";
    if (existingUserId) {
      await ensureUserProfileDefaults(ctx, existingUserId, {
        active: true,
        verticals: args.verticals ?? [],
        disciplines: args.disciplines ?? [],
        defaultOrganizationId: args.organizationId,
        payrollMethod: crewInvite.isArbor ? crewInvite.payrollMethod : undefined,
      });
      await upsertOrgMembership(ctx, {
        userId: existingUserId,
        organizationId: args.organizationId,
        role: membershipRole,
        active: true,
      });
      if (crewInvite.isArbor) {
        await applyCrewCompensationAndPayroll(ctx, {
          userId: existingUserId,
          rateMode: crewInvite.rateMode,
          customHourlyRateUsd: crewInvite.customHourlyRateUsd,
          payrollMethod: crewInvite.payrollMethod,
          updatedByUserId: adminId,
        });
      }
      await ensureOnboardingForOrgMembership(ctx, {
        userId: existingUserId,
        organizationId: args.organizationId,
      });
    }

    const invitationId = getRecordId(created);
    if (existingUserId) {
      await markInvitationAccepted(ctx, invitationId);
    }
    await scheduleUserInviteEmail(ctx, {
      invitationId,
      email,
      organizationId: args.organizationId,
      role: membershipRole,
      inviterId: adminId,
      expiresAt,
      verticals: args.verticals,
      disciplines: args.disciplines,
      rateMode: crewInvite.isArbor ? crewInvite.rateMode : undefined,
      customHourlyRateUsd: crewInvite.isArbor ? crewInvite.customHourlyRateUsd : undefined,
      payrollMethod: crewInvite.isArbor ? crewInvite.payrollMethod : undefined,
      isExistingUser: Boolean(existingUserId),
    });

    return { invitationId, email, expiresAt };
  },
});

export const resendInviteAdmin = mutation({
  args: { invitationId: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const invitesResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "invitation",
      paginationOpts: { cursor: null, numItems: 2000 },
    });
    const invite = ((invitesResult?.page ?? []) as InvitationRow[]).find(
      (row) => getRecordId(row) === args.invitationId,
    );
    if (!invite) throw new Error("Invitation not found.");
    if (!invite.email) throw new Error("Invitation is missing email.");
    const now = Date.now();
    const expiresAt = now + 14 * 24 * 60 * 60 * 1000;
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "invitation",
        where: [{ field: "email", value: invite.email }],
        update: {
          status: "pending",
          createdAt: now,
          expiresAt,
        },
      },
    });
    const pending = await ctx.db
      .query("pendingUserInvites")
      .withIndex("by_invitationId", (q) => q.eq("invitationId", args.invitationId))
      .unique();
    await scheduleUserInviteEmail(ctx, {
      invitationId: args.invitationId,
      email: invite.email,
      organizationId: invite.organizationId ?? "",
      role: invite.role ?? "member",
      inviterId: invite.inviterId ?? "",
      expiresAt,
      verticals: pending?.verticals as UserVertical[] | undefined,
      disciplines: pending?.disciplines as UserDiscipline[] | undefined,
      rateMode: pending?.rateMode,
      customHourlyRateUsd: pending?.customHourlyRateUsd,
      payrollMethod: pending?.payrollMethod,
      isExistingUser: await userExistsForInvite(ctx, invite.email),
      resendKey: String(now),
    });
    return { ok: true, expiresAt };
  },
});

async function userExistsForInvite(ctx: MutationCtx | QueryCtx, email: string) {
  const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email }],
  })) as AuthUser | null;
  return Boolean(user);
}

async function getInvitationById(ctx: MutationCtx | QueryCtx, invitationId: string) {
  const invitesResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "invitation",
    paginationOpts: { cursor: null, numItems: 2000 },
  });
  const invite = ((invitesResult?.page ?? []) as InvitationRow[]).find(
    (row) => getRecordId(row) === invitationId,
  );
  if (!invite) throw new Error("Invitation not found.");
  return invite;
}

export const updateInviteAdmin = mutation({
  args: {
    invitationId: v.string(),
    role: v.optional(v.string()),
    verticals: v.optional(v.array(userVerticalValue)),
    disciplines: v.optional(v.array(userDisciplineValue)),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const invite = await getInvitationById(ctx, args.invitationId);
    if (invite.status !== "pending") {
      throw new Error("Only pending invitations can be edited.");
    }
    if (!invite.email || !invite.organizationId) {
      throw new Error("Invitation is missing required details.");
    }

    const nextRole = await normalizeMembershipRole(
      ctx,
      invite.organizationId,
      args.role ?? invite.role ?? "member",
    );

    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "invitation",
        where: [{ field: "_id", value: args.invitationId }],
        update: {
          role: nextRole,
        },
      },
    });
    await updatePendingInviteDetails(ctx, args.invitationId, {
      role: nextRole,
      verticals: args.verticals,
      disciplines: args.disciplines,
    });

    return { ok: true };
  },
});

export const cancelInviteAdmin = mutation({
  args: { invitationId: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const invite = await getInvitationById(ctx, args.invitationId);
    if (invite.status !== "pending") {
      throw new Error("Only pending invitations can be cancelled.");
    }
    await markInvitationCancelled(ctx, args.invitationId);
    return { ok: true };
  },
});

export const createUserAdmin = mutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    email: v.string(),
    tempPassword: v.string(),
    role: v.string(),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    verticals: v.optional(v.array(userVerticalValue)),
    disciplines: v.optional(v.array(userDisciplineValue)),
    rateMode: v.optional(userCompensationRateModeValue),
    customHourlyRateUsd: v.optional(v.number()),
    hourlyRateUsd: v.optional(v.number()),
    payrollMethod: v.optional(payrollMethodValue),
  },
  handler: async (ctx, args) => {
    const membershipRole = await normalizeMembershipRole(ctx, args.organizationId, args.role);
    const adminUser = await requireAdmin(ctx);
    const adminId = getUserId(adminUser) || undefined;
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
    if (args.tempPassword.length < 8) throw new Error("Temporary password must be at least 8 characters.");
    const now = Date.now();

    const crewInvite = await assertArborCrewInviteCompensation(ctx, args.organizationId, {
      rateMode:
        args.rateMode ??
        (args.hourlyRateUsd !== undefined || args.customHourlyRateUsd !== undefined
          ? "custom"
          : undefined),
      customHourlyRateUsd: args.customHourlyRateUsd ?? args.hourlyRateUsd,
      payrollMethod: args.payrollMethod,
    });

    const existing = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    })) as AuthUser | null;
    let userId = existing ? getUserId(existing) : "";

    if (!existing) {
      const created = (await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "user",
          data: {
            name: args.name.trim() || email,
            email,
            emailVerified: true,
            role: membershipRole === "org_admin" ? "admin" : membershipRole === "org_member" ? "member" : membershipRole,
            createdAt: now,
            updatedAt: now,
          },
        },
      })) as AuthUser;
      userId = getUserId(created);
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "account",
          data: {
            accountId: email,
            providerId: "credential",
            userId,
            password: await hashPassword(args.tempPassword),
            createdAt: now,
            updatedAt: now,
          },
        },
      });
    } else {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "user",
          where: [{ field: "email", value: email }],
          update: {
            name: args.name.trim() || existing.name || email,
            role: membershipRole === "org_admin" ? "admin" : membershipRole === "org_member" ? "member" : membershipRole,
            updatedAt: now,
          },
        },
      });
    }

    await ensureUserProfileDefaults(ctx, userId, {
      title: args.title?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      active: true,
      verticals: args.verticals ?? [],
      disciplines: args.disciplines ?? [],
      defaultOrganizationId: args.organizationId,
      payrollMethod: crewInvite.isArbor ? crewInvite.payrollMethod : args.payrollMethod,
    });
    await upsertOrgMembership(ctx, {
      userId,
      organizationId: args.organizationId,
      role: membershipRole,
      active: true,
    });
    if (crewInvite.isArbor) {
      await applyCrewCompensationAndPayroll(ctx, {
        userId,
        rateMode: crewInvite.rateMode,
        customHourlyRateUsd: crewInvite.customHourlyRateUsd,
        payrollMethod: crewInvite.payrollMethod,
        updatedByUserId: adminId,
      });
    } else if (args.hourlyRateUsd !== undefined || args.customHourlyRateUsd !== undefined) {
      await upsertUserCompensationRate(ctx, {
        userId,
        rateMode: args.rateMode ?? "custom",
        hourlyRateUsd: args.customHourlyRateUsd ?? args.hourlyRateUsd ?? 0,
        updatedByUserId: adminId,
      });
    }
    await ensureOnboardingForOrgMembership(ctx, {
      userId,
      organizationId: args.organizationId,
    });
    return { userId, email };
  },
});

const REMOVED_BY_ADMIN_BAN_REASON = "Removed by admin";

function assertCanChangeUserAccess(
  adminUser: AuthUser,
  target: AuthUser,
  allUsers: AuthUser[],
  removing: boolean,
) {
  const adminId = getUserId(adminUser);
  const targetId = getUserId(target);
  if (!targetId) throw new Error("User not found.");
  if (removing && adminId && adminId === targetId) {
    throw new Error("You cannot remove your own access.");
  }
  if (!removing) return;
  if (!isAdmin(target) || target.banned) return;
  const otherActiveAdmins = allUsers.filter((user) => {
    const id = getUserId(user);
    return id && id !== targetId && isAdmin(user) && !user.banned;
  });
  if (otherActiveAdmins.length === 0) {
    throw new Error("Cannot remove the last remaining admin.");
  }
}

async function setAuthUserBanState(
  ctx: MutationCtx,
  email: string,
  banned: boolean,
  now: number,
) {
  await ctx.runMutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: "user",
      where: [{ field: "email", value: email }],
      update: {
        banned,
        banReason: banned ? REMOVED_BY_ADMIN_BAN_REASON : null,
        banExpires: null,
        updatedAt: now,
      },
    },
  });
}

export const updateUserAdmin = mutation({
  args: {
    userId: v.string(),
    role: v.optional(v.string()),
    active: v.optional(v.boolean()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    verticals: v.optional(v.array(userVerticalValue)),
    disciplines: v.optional(v.array(userDisciplineValue)),
    showOnPublicCrewPage: v.optional(v.boolean()),
    publicCrewDescription: v.optional(v.string()),
    defaultOrganizationId: v.optional(v.string()),
    rateMode: v.optional(userCompensationRateModeValue),
    customHourlyRateUsd: v.optional(v.number()),
    hourlyRateUsd: v.optional(v.number()),
    payrollMethod: v.optional(payrollMethodValue),
    organizationMemberships: v.optional(
      v.array(
        v.object({
          organizationId: v.string(),
          role: v.union(v.string(), externalOrgRoleValue),
          active: v.boolean(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const adminUser = await requireAdmin(ctx);
    const users = await getAllAuthUsers(ctx);
    const target = users.find((user) => getUserId(user) === args.userId);
    if (!target || !target.email) throw new Error("User not found.");
    const now = Date.now();
    if (args.role) {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "user",
          where: [{ field: "email", value: target.email }],
          update: {
            role: args.role,
            updatedAt: now,
          },
        },
      });
    }

    const existingProfile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const nextActive = args.active ?? existingProfile?.active ?? true;
    if (args.active !== undefined && args.active !== (existingProfile?.active ?? true)) {
      assertCanChangeUserAccess(adminUser, target, users, !args.active);
      await setAuthUserBanState(ctx, target.email, !args.active, now);
    }
    const existingMembership = existingProfile
      ? resolveProfileMembership(existingProfile)
      : { verticals: [], disciplines: [] };
    await ensureUserProfileDefaults(ctx, args.userId, {
      title: args.title?.trim() ?? existingProfile?.title,
      phone: args.phone ?? existingProfile?.phone,
      active: nextActive,
      verticals: args.verticals ?? existingMembership.verticals,
      disciplines: args.disciplines ?? existingMembership.disciplines,
      showOnPublicCrewPage:
        args.showOnPublicCrewPage !== undefined
          ? args.showOnPublicCrewPage
          : existingProfile?.showOnPublicCrewPage,
      publicCrewDescription:
        args.publicCrewDescription !== undefined
          ? args.publicCrewDescription
          : existingProfile?.publicCrewDescription,
      payrollMethod: args.payrollMethod ?? existingProfile?.payrollMethod,
      defaultOrganizationId: args.defaultOrganizationId ?? existingProfile?.defaultOrganizationId,
    });

    if (args.rateMode !== undefined || args.hourlyRateUsd !== undefined || args.customHourlyRateUsd !== undefined) {
      const rateMode =
        args.rateMode ??
        (args.hourlyRateUsd !== undefined || args.customHourlyRateUsd !== undefined ? "custom" : "custom");
      await upsertUserCompensationRate(ctx, {
        userId: args.userId,
        rateMode,
        hourlyRateUsd: args.customHourlyRateUsd ?? args.hourlyRateUsd,
        updatedByUserId: getUserId(adminUser) || undefined,
      });
    }

    if (args.organizationMemberships) {
      for (const membership of args.organizationMemberships) {
        const membershipRole = await normalizeMembershipRole(
          ctx,
          membership.organizationId,
          membership.role,
        );
        await upsertOrgMembership(ctx, {
          userId: args.userId,
          organizationId: membership.organizationId,
          role: membershipRole,
          active: membership.active,
        });
      }
    }
    return { ok: true };
  },
});

export const setUserAccessAdmin = mutation({
  args: {
    userId: v.string(),
    removed: v.boolean(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const adminUser = await requireAdmin(ctx);
    const users = await getAllAuthUsers(ctx);
    const target = users.find((user) => getUserId(user) === args.userId);
    if (!target?.email) throw new Error("User not found.");

    assertCanChangeUserAccess(adminUser, target, users, args.removed);

    const now = Date.now();
    await setAuthUserBanState(ctx, target.email, args.removed, now);

    const existingProfile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const existingMembership = existingProfile
      ? resolveProfileMembership(existingProfile)
      : { verticals: [], disciplines: [] };
    await ensureUserProfileDefaults(ctx, args.userId, {
      title: existingProfile?.title,
      phone: existingProfile?.phone,
      active: !args.removed,
      verticals: existingMembership.verticals,
      disciplines: existingMembership.disciplines,
      showOnPublicCrewPage: existingProfile?.showOnPublicCrewPage,
      publicCrewDescription: existingProfile?.publicCrewDescription,
      defaultOrganizationId: existingProfile?.defaultOrganizationId,
    });

    return { ok: true };
  },
});

export const setCompensationRate = mutation({
  args: {
    userId: v.string(),
    rateMode: userCompensationRateModeValue,
    hourlyRateUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const adminUser = await requireAdmin(ctx);
    return await upsertUserCompensationRate(ctx, {
      userId: args.userId,
      rateMode: args.rateMode,
      hourlyRateUsd: args.hourlyRateUsd,
      updatedByUserId: getUserId(adminUser) || undefined,
    });
  },
});

/** @deprecated Prefer setCompensationRate with rateMode. */
export const setHourlyRate = mutation({
  args: {
    userId: v.string(),
    hourlyRateUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const adminUser = await requireAdmin(ctx);
    return await upsertUserCompensationRate(ctx, {
      userId: args.userId,
      rateMode: "custom",
      hourlyRateUsd: args.hourlyRateUsd,
      updatedByUserId: getUserId(adminUser) || undefined,
    });
  },
});

export const setPayrollMethod = mutation({
  args: {
    userId: v.string(),
    payrollMethod: payrollMethodValue,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await applyPayrollMethodToProfile(ctx, args.userId, args.payrollMethod);
    return { ok: true };
  },
});

export const addUserOrganizationMembershipAdmin = mutation({
  args: {
    userId: v.string(),
    organizationId: v.string(),
    role: v.optional(v.union(v.string(), externalOrgRoleValue)),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const role = await normalizeMembershipRole(ctx, args.organizationId, args.role);
    const existing = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", args.userId).eq("organizationId", args.organizationId),
      )
      .unique();
    if (existing) {
      throw new Error("Membership already exists for this user and organization.");
    }
    const id = await upsertOrgMembership(ctx, {
      userId: args.userId,
      organizationId: args.organizationId,
      role,
      active: args.active ?? true,
    });
    return { id, role };
  },
});

export const removeUserOrganizationMembershipAdmin = mutation({
  args: {
    userId: v.string(),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", args.userId).eq("organizationId", args.organizationId),
      )
      .unique();
    if (!existing) {
      throw new Error("Membership not found.");
    }
    await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

export const sendPasswordResetAdmin = mutation({
  args: { userId: v.string() },
  returns: v.object({ ok: v.boolean(), email: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const users = await getAllAuthUsers(ctx);
    const target = users.find((user) => getUserId(user) === args.userId);
    if (!target?.email) throw new Error("User email not found.");
    await ctx.scheduler.runAfter(0, internal.account.requestPasswordResetInternal, {
      email: target.email,
    });
    return { ok: true, email: target.email };
  },
});

export const getActiveBandProfile = query({
  args: {},
  handler: async (ctx) => {
    const context = await requireBandContext(ctx);
    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", context.organizationId))
      .unique();
    return {
      organizationId: context.organizationId,
      name: context.organizationName,
      displayName: profile?.displayName ?? context.organizationName,
      bio: profile?.bio ?? "",
      performerHourlyRateUsd: profile?.performerHourlyRateUsd ?? 0,
      designatedPayeeUserId: profile?.designatedPayeeUserId ?? "",
      designatedPayeeName: profile?.designatedPayeeName ?? "",
      designatedPayeeEmail: profile?.designatedPayeeEmail ?? "",
      designatedPayeeMailingAddress: profile?.designatedPayeeMailingAddress ?? "",
      designatedPayeePayoutMethod:
        profile?.designatedPayeePayoutMethod === "pickup" ||
        profile?.designatedPayeePayoutMethod === "delivery"
          ? profile.designatedPayeePayoutMethod
          : "",
      payeeComplete: isBandPayeeComplete({
        designatedPayeeName: profile?.designatedPayeeName,
        designatedPayeeEmail: profile?.designatedPayeeEmail,
        designatedPayeeMailingAddress: profile?.designatedPayeeMailingAddress,
        designatedPayeePayoutMethod: profile?.designatedPayeePayoutMethod,
      }),
      publicWebsiteUrl: profile?.publicWebsiteUrl ?? "",
      publicInstagramUrl: profile?.publicInstagramUrl ?? "",
      publicYoutubeUrl: profile?.publicYoutubeUrl ?? "",
      publicSpotifyUrl: profile?.publicSpotifyUrl ?? "",
      demoURL: profile?.demoURL ?? "",
      publicListing: profile?.publicListing ?? false,
      publicSlug: profile?.publicSlug ?? "",
      publicHeroImageUrl: profile?.publicHeroImageUrl ?? "",
    };
  },
});

export const updateActiveBandProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    performerHourlyRateUsd: v.optional(v.number()),
    designatedPayeeUserId: v.optional(v.string()),
    designatedPayeeName: v.optional(v.string()),
    designatedPayeeEmail: v.optional(v.string()),
    designatedPayeeMailingAddress: v.optional(v.string()),
    designatedPayeePayoutMethod: v.optional(
      v.union(v.literal("pickup"), v.literal("delivery")),
    ),
    publicWebsiteUrl: v.optional(v.string()),
    publicInstagramUrl: v.optional(v.string()),
    publicYoutubeUrl: v.optional(v.string()),
    publicSpotifyUrl: v.optional(v.string()),
    demoURL: v.optional(v.string()),
    publicListing: v.optional(v.boolean()),
    publicSlug: v.optional(v.string()),
    publicHeroImageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const context = await requireBandContext(ctx);
    if (args.performerHourlyRateUsd !== undefined && args.performerHourlyRateUsd < 0) {
      throw new Error("Performer hourly rate must be 0 or greater.");
    }
    const publicSlug =
      args.publicSlug === undefined ? undefined : normalizePublicSlug(args.publicSlug);
    if (publicSlug) {
      await assertUniqueBandPublicSlug(ctx, publicSlug, context.organizationId);
    }
    const publicListing = args.publicListing;
    if (publicListing && !publicSlug) {
      throw new Error("Public slug is required when enabling public artist listing.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", context.organizationId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        organizationType: existing.organizationType ?? "band",
        // Callers send partial payloads (the onboarding wizard saves one step
        // at a time), so every field here preserves `existing` when omitted.
        displayName:
          args.displayName !== undefined
            ? args.displayName.trim() || undefined
            : existing.displayName,
        bio: args.bio !== undefined ? args.bio.trim() || undefined : existing.bio,
        performerHourlyRateUsd: args.performerHourlyRateUsd ?? existing.performerHourlyRateUsd,
        designatedPayeeUserId:
          args.designatedPayeeUserId !== undefined
            ? args.designatedPayeeUserId.trim() || undefined
            : existing.designatedPayeeUserId,
        designatedPayeeName:
          args.designatedPayeeName !== undefined
            ? args.designatedPayeeName.trim() || undefined
            : existing.designatedPayeeName,
        designatedPayeeEmail:
          args.designatedPayeeEmail !== undefined
            ? args.designatedPayeeEmail.trim().toLowerCase() || undefined
            : existing.designatedPayeeEmail,
        designatedPayeeMailingAddress:
          args.designatedPayeeMailingAddress !== undefined
            ? args.designatedPayeeMailingAddress.trim() || undefined
            : existing.designatedPayeeMailingAddress,
        designatedPayeePayoutMethod:
          args.designatedPayeePayoutMethod !== undefined
            ? args.designatedPayeePayoutMethod
            : existing.designatedPayeePayoutMethod,
        publicWebsiteUrl:
          args.publicWebsiteUrl !== undefined
            ? args.publicWebsiteUrl.trim() || undefined
            : existing.publicWebsiteUrl,
        publicInstagramUrl:
          args.publicInstagramUrl !== undefined
            ? args.publicInstagramUrl.trim() || undefined
            : existing.publicInstagramUrl,
        publicYoutubeUrl:
          args.publicYoutubeUrl !== undefined
            ? args.publicYoutubeUrl.trim() || undefined
            : existing.publicYoutubeUrl,
        publicSpotifyUrl:
          args.publicSpotifyUrl !== undefined
            ? args.publicSpotifyUrl.trim() || undefined
            : existing.publicSpotifyUrl,
        demoURL:
          args.demoURL !== undefined ? args.demoURL.trim() || undefined : existing.demoURL,
        publicListing: publicListing ?? existing.publicListing,
        publicSlug: publicSlug ?? (publicListing === false ? undefined : existing.publicSlug),
        publicHeroImageUrl:
          args.publicHeroImageUrl !== undefined
            ? normalizeOptionalAssetReference(args.publicHeroImageUrl)
            : existing.publicHeroImageUrl,
        updatedAt: now,
      });
      await ctx.runMutation(internal.bandPayments.refreshPendingPayeePaymentsForOrg, {
        organizationId: context.organizationId,
      });
      return existing._id;
    }
    const profileId = await ctx.db.insert("organizationProfiles", {
      organizationId: context.organizationId,
      organizationType: "band",
      displayName: args.displayName?.trim() || context.organizationName,
      bio: args.bio?.trim() || undefined,
      performerHourlyRateUsd: args.performerHourlyRateUsd,
      designatedPayeeUserId: args.designatedPayeeUserId?.trim() || undefined,
      designatedPayeeName: args.designatedPayeeName?.trim() || undefined,
      designatedPayeeEmail: args.designatedPayeeEmail?.trim().toLowerCase() || undefined,
      designatedPayeeMailingAddress: args.designatedPayeeMailingAddress?.trim() || undefined,
      designatedPayeePayoutMethod: args.designatedPayeePayoutMethod,
      publicWebsiteUrl: args.publicWebsiteUrl?.trim() || undefined,
      publicInstagramUrl: args.publicInstagramUrl?.trim() || undefined,
      publicYoutubeUrl: args.publicYoutubeUrl?.trim() || undefined,
      publicSpotifyUrl: args.publicSpotifyUrl?.trim() || undefined,
      demoURL: args.demoURL?.trim() || undefined,
      publicListing: publicListing ?? false,
      publicSlug: publicListing ? publicSlug : undefined,
      publicHeroImageUrl: normalizeOptionalAssetReference(args.publicHeroImageUrl),
      updatedAt: now,
    });
    await ctx.runMutation(internal.bandPayments.refreshPendingPayeePaymentsForOrg, {
      organizationId: context.organizationId,
    });
    return profileId;
  },
});

export const listMembersForActiveOrganization = query({
  args: {},
  handler: async (ctx) => {
    const context = await requireBandContext(ctx);
    const allUsers = await getAllAuthUsers(ctx);
    const usersById = new Map(allUsers.map((user) => [getUserId(user), user]));
    const profiles = await ctx.db.query("userAdminProfiles").withIndex("by_active").take(2000);
    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
    const memberships = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", context.organizationId))
      .take(500);
    return memberships
      .map((membership) => {
        const user = usersById.get(membership.userId);
        const profile = profileByUserId.get(membership.userId);
        return {
          userId: membership.userId,
          name: user?.name ?? user?.email ?? membership.userId,
          email: user?.email ?? "",
          title: profile?.title ?? "",
          bandRole: membership.bandRole ?? "",
          role: membership.role,
          active: membership.active,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listPendingInvitesForActiveOrganization = query({
  args: {},
  handler: async (ctx) => {
    const context = await requireBandContext(ctx);
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "invitation",
      paginationOpts: { cursor: null, numItems: 500 },
    });
    const pendingMeta = await ctx.db.query("pendingUserInvites").take(2000);
    const metaByInvitationId = new Map(
      pendingMeta.map((row) => [row.invitationId, row]),
    );
    return ((result?.page ?? []) as InvitationRow[])
      .filter((invite) => invite.organizationId === context.organizationId && invite.status === "pending")
      .map((invite) => {
        const invitationId = getRecordId(invite);
        const meta = metaByInvitationId.get(invitationId);
        return {
          invitationId,
          email: invite.email ?? "",
          role: invite.role ?? "org_member",
          bandRole: meta?.bandRole ?? "",
          expiresAt: invite.expiresAt ?? 0,
        };
      })
      .filter((invite) => Boolean(invite.invitationId))
      .sort((a, b) => a.expiresAt - b.expiresAt);
  },
});

export const inviteMemberToActiveOrganization = mutation({
  args: {
    email: v.string(),
    role: externalOrgRoleValue,
    bandRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const context = await requireBandContext(ctx);
    const admin = await requireAuth(ctx);
    const adminId = getUserId(admin);
    const now = Date.now();
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
    const bandRole = args.bandRole?.trim() || undefined;
    const expiresAt = now + 14 * 24 * 60 * 60 * 1000;
    const created = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "invitation",
        data: {
          organizationId: context.organizationId,
          email,
          role: args.role,
          status: "pending",
          expiresAt,
          createdAt: now,
          inviterId: adminId,
        },
      },
    });
    const invitationId = getRecordId(created as { id?: string; _id?: string });
    const existingUser = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    })) as AuthUser | null;
    const existingUserId = existingUser ? getUserId(existingUser) : "";
    if (existingUserId) {
      await upsertOrgMembership(ctx, {
        userId: existingUserId,
        organizationId: context.organizationId,
        role: args.role,
        active: true,
        bandRole,
      });
      await ensureOnboardingForOrgMembership(ctx, {
        userId: existingUserId,
        organizationId: context.organizationId,
      });
      await markInvitationAccepted(ctx, invitationId);
    }
    await scheduleUserInviteEmail(ctx, {
      invitationId,
      email,
      organizationId: context.organizationId,
      role: args.role,
      bandRole,
      inviterId: adminId,
      expiresAt,
      isExistingUser: Boolean(existingUserId),
    });
    return { invitationId };
  },
});

export const updateMemberBandRole = mutation({
  args: {
    userId: v.string(),
    bandRole: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await requireBandContext(ctx);
    const actor = await requireAuth(ctx);
    const actorId = getUserId(actor);
    const targetUserId = args.userId.trim();
    if (!targetUserId) throw new Error("User is required.");

    const actorMembership = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", actorId).eq("organizationId", context.organizationId),
      )
      .unique();
    const isOrgAdmin =
      actorMembership?.role === "org_admin" ||
      actorMembership?.role === "admin" ||
      isAdmin(actor);
    if (actorId !== targetUserId && !isOrgAdmin) {
      throw new Error("Only band admins can edit another member's role.");
    }

    const membership = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", targetUserId).eq("organizationId", context.organizationId),
      )
      .unique();
    if (!membership || !membership.active) {
      throw new Error("Member not found in this band.");
    }
    await ctx.db.patch(membership._id, {
      bandRole: args.bandRole.trim() || undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const backfillUserAdminDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const defaultOrg = await resolveOrCreateOrganization(ctx, "Arbor Live");
    const now = Date.now();
    const defaultOrgProfile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", defaultOrg.id))
      .unique();
    if (defaultOrgProfile) {
      await ctx.db.patch(defaultOrgProfile._id, {
        organizationType: "arbor_internal",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("organizationProfiles", {
        organizationId: defaultOrg.id,
        organizationType: "arbor_internal",
        displayName: "Arbor Live",
        updatedAt: now,
      });
    }
    const organizations = await getAllOrganizations(ctx);
    for (const org of organizations) {
      const orgId = getRecordId(org);
      if (!orgId || orgId === defaultOrg.id) continue;
      const existing = await ctx.db
        .query("organizationProfiles")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", orgId))
        .unique();
      if (existing) {
        if (existing.organizationType !== "band" && existing.organizationType !== "dj") {
          await ctx.db.patch(existing._id, { organizationType: "band", updatedAt: now });
        }
      } else {
        await ctx.db.insert("organizationProfiles", {
          organizationId: orgId,
          organizationType: "band",
          displayName: org.name ?? undefined,
          updatedAt: now,
        });
      }
    }
    const users = await getAllAuthUsers(ctx);
    let touchedProfiles = 0;
    let touchedMemberships = 0;
    for (const user of users) {
      const userId = getUserId(user);
      if (!userId) continue;
      await ensureUserProfileDefaults(ctx, userId, {
        title: undefined,
        active: true,
        verticals: [],
        disciplines: [],
        defaultOrganizationId: defaultOrg.id,
      });
      touchedProfiles += 1;
      await upsertOrgMembership(ctx, {
        userId,
        organizationId: defaultOrg.id,
        role: user.role ?? "member",
        active: true,
      });
      touchedMemberships += 1;
      const activeOrg = await ctx.db
        .query("userActiveOrganizations")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (!activeOrg) {
        await ctx.db.insert("userActiveOrganizations", {
          userId,
          organizationId: defaultOrg.id,
          updatedAt: now,
        });
      }
    }
    return {
      profilesTouched: touchedProfiles,
      membershipsTouched: touchedMemberships,
      defaultOrganizationId: defaultOrg.id,
    };
  },
});

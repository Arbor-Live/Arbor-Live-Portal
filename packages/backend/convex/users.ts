import { hashPassword } from "better-auth/crypto";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  getUserId,
  isAdmin,
  requireAdmin,
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

const USER_TEAMS = ["Sound", "Lights", "Design", "Marketing", "Operations"] as const;
const userTeamValue = v.union(
  v.literal("Sound"),
  v.literal("Lights"),
  v.literal("Design"),
  v.literal("Marketing"),
  v.literal("Operations"),
);

type UserTeam = (typeof USER_TEAMS)[number];
const invitationStatusValue = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("expired"),
  v.literal("cancelled"),
);
const externalOrgRoleValue = v.union(v.literal("org_admin"), v.literal("org_member"));

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

async function getAllAuthUsers(ctx: QueryCtx | MutationCtx) {
  const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "user",
    paginationOpts: { cursor: null, numItems: 1000 },
  });
  return (result?.page ?? []) as AuthUser[];
}

async function getAllOrganizations(ctx: QueryCtx | MutationCtx) {
  const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "organization",
    paginationOpts: { cursor: null, numItems: 500 },
  });
  return (result?.page ?? []) as OrganizationRow[];
}

async function resolveOrCreateOrganization(ctx: MutationCtx, name: string) {
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
  profile?: { organizationType: "arbor_internal" | "band" } | null,
): "arbor_internal" | "band" {
  if (isArborOrganization(organization)) return "arbor_internal";
  return profile?.organizationType ?? "band";
}

async function getOrganizationType(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  const organizations = await getAllOrganizations(ctx);
  const organization = organizations.find((entry) => getRecordId(entry) === organizationId);
  return resolveOrganizationType(organization, profile);
}

async function ensureUserProfileDefaults(
  ctx: MutationCtx,
  userId: string,
  {
    title,
    phone,
    active = true,
    teams = [],
    showOnPublicCrewPage,
    publicCrewDescription,
    defaultOrganizationId,
  }: {
    title?: string;
    phone?: string;
    active?: boolean;
    teams?: UserTeam[];
    showOnPublicCrewPage?: boolean;
    publicCrewDescription?: string;
    defaultOrganizationId?: string;
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
      teams,
      showOnPublicCrewPage:
        showOnPublicCrewPage !== undefined ? showOnPublicCrewPage : existing.showOnPublicCrewPage,
      publicCrewDescription:
        publicCrewDescription !== undefined ? normalizedDescription : existing.publicCrewDescription,
      defaultOrganizationId: defaultOrganizationId ?? existing.defaultOrganizationId,
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("userAdminProfiles", {
    userId,
    title,
    phone,
    active,
    teams,
    showOnPublicCrewPage,
    publicCrewDescription: normalizedDescription,
    defaultOrganizationId,
    createdAt: now,
    updatedAt: now,
  });
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

async function upsertOrgMembership(
  ctx: MutationCtx,
  args: { userId: string; organizationId: string; role: string; active: boolean },
) {
  const now = Date.now();
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
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("userOrganizationMemberships", {
    userId: args.userId,
    organizationId: args.organizationId,
    role: args.role,
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
      }))
      .filter((org) => Boolean(org.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listBandOrganizationsAdmin = query({
  args: {},
  handler: async (ctx) => {
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
          performerHourlyRateUsd: profile?.performerHourlyRateUsd ?? 0,
          designatedPayeeUserId: profile?.designatedPayeeUserId ?? "",
          designatedPayeeName: profile?.designatedPayeeName ?? "",
          designatedPayeeEmail: profile?.designatedPayeeEmail ?? "",
          designatedPayeeMailingAddress: profile?.designatedPayeeMailingAddress ?? "",
          publicWebsiteUrl: profile?.publicWebsiteUrl ?? "",
          publicInstagramUrl: profile?.publicInstagramUrl ?? "",
          publicYoutubeUrl: profile?.publicYoutubeUrl ?? "",
          publicListing: profile?.publicListing ?? false,
          publicSlug: profile?.publicSlug ?? "",
          publicHeroImageUrl: profile?.publicHeroImageUrl ?? "",
        };
      })
      .filter((organization) => organization.organizationType === "band")
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
    publicWebsiteUrl: v.optional(v.string()),
    publicInstagramUrl: v.optional(v.string()),
    publicYoutubeUrl: v.optional(v.string()),
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
        organizationType: "band",
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
        publicWebsiteUrl: args.publicWebsiteUrl?.trim() || undefined,
        publicInstagramUrl: args.publicInstagramUrl?.trim() || undefined,
        publicYoutubeUrl: args.publicYoutubeUrl?.trim() || undefined,
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
      publicWebsiteUrl: args.publicWebsiteUrl?.trim() || undefined,
      publicInstagramUrl: args.publicInstagramUrl?.trim() || undefined,
      publicYoutubeUrl: args.publicYoutubeUrl?.trim() || undefined,
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

export const createOrganizationAdmin = mutation({
  args: { name: v.string(), organizationType: v.optional(v.union(v.literal("arbor_internal"), v.literal("band"))) },
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
    const organizations = await getAllOrganizations(ctx);
    const profileRows = await ctx.db.query("organizationProfiles").withIndex("by_organizationType").take(500);
    const profileByOrgId = new Map(profileRows.map((row) => [row.organizationId, row]));
    return activeMemberships
      .map((membership) => {
        const organization = organizations.find((entry) => getRecordId(entry) === membership.organizationId);
        return {
          organizationId: membership.organizationId,
          name: organization?.name ?? "Organization",
          slug: organization?.slug ?? "",
          role: membership.role,
          organizationType: resolveOrganizationType(
            organization,
            profileByOrgId.get(membership.organizationId),
          ),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getViewer = query({
  args: {},
  returns: v.object({
    userId: v.string(),
    role: v.optional(v.string()),
    isAdmin: v.boolean(),
  }),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return {
      userId: getUserId(user),
      role: user.role ?? undefined,
      isAdmin: isAdmin(user),
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
    const organizations = await getAllOrganizations(ctx);
    const organization = organizations.find((entry) => getRecordId(entry) === membership.organizationId);
    const organizationType = await getOrganizationType(ctx, membership.organizationId);
    return {
      organizationId: membership.organizationId,
      name: organization?.name ?? "Organization",
      slug: organization?.slug ?? "",
      role: membership.role,
      organizationType,
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
    const rateByUserId = new Map(rates.map((rate) => [rate.userId, rate.hourlyRateUsd]));
    return users
      .map((user) => {
        const id = getUserId(user);
        return {
          id,
          name: user.name ?? user.email ?? "Unknown user",
          email: user.email ?? "",
          role: user.role ?? "",
          hourlyRateUsd: rateByUserId.get(id) ?? null,
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
    const rateByUserId = new Map(rates.map((rate) => [rate.userId, rate.hourlyRateUsd]));
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
        const memberships = (membershipsByUserId.get(id) ?? [])
          .map((membership) => ({
            organizationId: membership.organizationId,
            organizationName:
              organizationById.get(membership.organizationId)?.name ?? membership.organizationId,
            role: membership.role,
            active: membership.active,
          }))
          .sort((a, b) => a.organizationName.localeCompare(b.organizationName));
        return {
          id,
          name: user.name ?? user.email ?? "Unknown user",
          email: user.email ?? "",
          role: user.role ?? "member",
          banned: Boolean(user.banned),
          active: profile?.active ?? true,
          phone: profile?.phone ?? "",
          title: profile?.title ?? "",
          teams: profile?.teams ?? [],
          showOnPublicCrewPage: profile?.showOnPublicCrewPage ?? false,
          publicCrewDescription: profile?.publicCrewDescription ?? "",
          defaultOrganizationId: profile?.defaultOrganizationId ?? "",
          organizationMemberships: memberships,
          hourlyRateUsd: rateByUserId.get(id) ?? null,
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
          user.teams.join(" "),
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
          teams: (pending?.teams ?? []) as UserTeam[],
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
    teams: v.optional(v.array(userTeamValue)),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const adminId = getUserId(admin);
    if (!adminId) throw new Error("Unable to resolve current admin user.");
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
    const now = Date.now();
    const expiresAt = now + 14 * 24 * 60 * 60 * 1000;

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
        teams: args.teams ?? [],
        defaultOrganizationId: args.organizationId,
      });
      await upsertOrgMembership(ctx, {
        userId: existingUserId,
        organizationId: args.organizationId,
        role: membershipRole,
        active: true,
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
      teams: args.teams,
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
    await scheduleUserInviteEmail(ctx, {
      invitationId: args.invitationId,
      email: invite.email,
      organizationId: invite.organizationId ?? "",
      role: invite.role ?? "member",
      inviterId: invite.inviterId ?? "",
      expiresAt,
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
    teams: v.optional(v.array(userTeamValue)),
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
    const nextTeams = args.teams;

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
      teams: nextTeams,
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
    teams: v.optional(v.array(userTeamValue)),
    hourlyRateUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const membershipRole = await normalizeMembershipRole(ctx, args.organizationId, args.role);
    const adminUser = await requireAdmin(ctx);
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
    if (args.tempPassword.length < 8) throw new Error("Temporary password must be at least 8 characters.");
    const now = Date.now();
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
      teams: args.teams ?? [],
      defaultOrganizationId: args.organizationId,
    });
    await upsertOrgMembership(ctx, {
      userId,
      organizationId: args.organizationId,
      role: membershipRole,
      active: true,
    });
    if (args.hourlyRateUsd !== undefined) {
      if (args.hourlyRateUsd < 0) throw new Error("Hourly rate must be a positive number.");
      const existingRate = await ctx.db
        .query("userCompensationRates")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (existingRate) {
        await ctx.db.patch(existingRate._id, {
          hourlyRateUsd: args.hourlyRateUsd,
          updatedByUserId: getUserId(adminUser) || undefined,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("userCompensationRates", {
          userId,
          hourlyRateUsd: args.hourlyRateUsd,
          updatedByUserId: getUserId(adminUser) || undefined,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    return { userId, email };
  },
});

export const updateUserAdmin = mutation({
  args: {
    userId: v.string(),
    role: v.optional(v.string()),
    active: v.optional(v.boolean()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    teams: v.optional(v.array(userTeamValue)),
    showOnPublicCrewPage: v.optional(v.boolean()),
    publicCrewDescription: v.optional(v.string()),
    defaultOrganizationId: v.optional(v.string()),
    hourlyRateUsd: v.optional(v.number()),
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
    await ensureUserProfileDefaults(ctx, args.userId, {
      title: args.title?.trim() ?? existingProfile?.title,
      phone: args.phone ?? existingProfile?.phone,
      active: args.active ?? existingProfile?.active ?? true,
      teams: args.teams ?? (existingProfile?.teams as UserTeam[] | undefined) ?? [],
      showOnPublicCrewPage:
        args.showOnPublicCrewPage !== undefined
          ? args.showOnPublicCrewPage
          : existingProfile?.showOnPublicCrewPage,
      publicCrewDescription:
        args.publicCrewDescription !== undefined
          ? args.publicCrewDescription
          : existingProfile?.publicCrewDescription,
      defaultOrganizationId: args.defaultOrganizationId ?? existingProfile?.defaultOrganizationId,
    });

    if (args.hourlyRateUsd !== undefined) {
      if (args.hourlyRateUsd < 0) throw new Error("Hourly rate must be a positive number.");
      const existingRate = await ctx.db
        .query("userCompensationRates")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique();
      if (existingRate) {
        await ctx.db.patch(existingRate._id, {
          hourlyRateUsd: args.hourlyRateUsd,
          updatedByUserId: getUserId(adminUser) || undefined,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("userCompensationRates", {
          userId: args.userId,
          hourlyRateUsd: args.hourlyRateUsd,
          updatedByUserId: getUserId(adminUser) || undefined,
          createdAt: now,
          updatedAt: now,
        });
      }
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

export const setHourlyRate = mutation({
  args: {
    userId: v.string(),
    hourlyRateUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const adminUser = await requireAdmin(ctx);
    if (args.hourlyRateUsd < 0) {
      throw new Error("Hourly rate must be a positive number.");
    }
    const existing = await ctx.db
      .query("userCompensationRates")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        hourlyRateUsd: args.hourlyRateUsd,
        updatedByUserId: getUserId(adminUser) || undefined,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("userCompensationRates", {
      userId: args.userId,
      hourlyRateUsd: args.hourlyRateUsd,
      updatedByUserId: getUserId(adminUser) || undefined,
      createdAt: now,
      updatedAt: now,
    });
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
      payeeComplete: isBandPayeeComplete({
        designatedPayeeName: profile?.designatedPayeeName,
        designatedPayeeEmail: profile?.designatedPayeeEmail,
        designatedPayeeMailingAddress: profile?.designatedPayeeMailingAddress,
      }),
      publicWebsiteUrl: profile?.publicWebsiteUrl ?? "",
      publicInstagramUrl: profile?.publicInstagramUrl ?? "",
      publicYoutubeUrl: profile?.publicYoutubeUrl ?? "",
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
    publicWebsiteUrl: v.optional(v.string()),
    publicInstagramUrl: v.optional(v.string()),
    publicYoutubeUrl: v.optional(v.string()),
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
        organizationType: "band",
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
        publicWebsiteUrl: args.publicWebsiteUrl?.trim() || undefined,
        publicInstagramUrl: args.publicInstagramUrl?.trim() || undefined,
        publicYoutubeUrl: args.publicYoutubeUrl?.trim() || undefined,
        publicListing: publicListing ?? existing.publicListing,
        publicSlug: publicSlug ?? (publicListing === false ? undefined : existing.publicSlug),
        publicHeroImageUrl: normalizeOptionalAssetReference(args.publicHeroImageUrl),
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
      publicWebsiteUrl: args.publicWebsiteUrl?.trim() || undefined,
      publicInstagramUrl: args.publicInstagramUrl?.trim() || undefined,
      publicYoutubeUrl: args.publicYoutubeUrl?.trim() || undefined,
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
          role: membership.role,
          active: membership.active,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const inviteMemberToActiveOrganization = mutation({
  args: {
    email: v.string(),
    role: externalOrgRoleValue,
  },
  handler: async (ctx, args) => {
    const context = await requireBandContext(ctx);
    const admin = await requireAuth(ctx);
    const adminId = getUserId(admin);
    const now = Date.now();
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
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
      });
      await markInvitationAccepted(ctx, invitationId);
    }
    await scheduleUserInviteEmail(ctx, {
      invitationId,
      email,
      organizationId: context.organizationId,
      role: args.role,
      inviterId: adminId,
      expiresAt,
      isExistingUser: Boolean(existingUserId),
    });
    return { invitationId };
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
        if (existing.organizationType !== "band") {
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
        teams: [],
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

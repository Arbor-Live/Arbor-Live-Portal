/**
 * Centralized authorization helpers for all Convex queries/mutations in this app.
 *
 * Three guarantees:
 *   1. requireAuth(ctx)  -> rejects unauthenticated requests, rejects banned users.
 *   2. requireAdmin(ctx) -> rejects non-admins (admin role is the better-auth admin plugin role).
 *   3. getCurrentUserOrNull(ctx) -> for queries that may want to vary output for guests.
 *
 * IMPORTANT: Every public Convex function (query/mutation/action) that touches
 * application data MUST call one of these helpers, with the only exceptions
 * being explicitly token-gated public endpoints (see `isTokenScoped` audit
 * notes in each module).
 */
import { components } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  hasAnyVertical,
  hasVertical,
  resolveProfileMembership,
  type UserVertical,
} from "./userVerticals";

export type AuthUser = {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  role?: string | null;
  banned?: boolean | null;
};

type AuthCtx = QueryCtx | MutationCtx;

/** Per-request memo: most handlers call requireAuth + requireArborInternalContext. */
const currentUserCache = new WeakMap<AuthCtx, Promise<AuthUser | null>>();
const activeOrgCache = new WeakMap<AuthCtx, Promise<ActiveOrganizationContext | null>>();

export function getUserId(user: AuthUser): string {
  return user.id ?? user._id ?? "";
}

export async function getCurrentUserOrNull(
  ctx: AuthCtx,
): Promise<AuthUser | null> {
  const cached = currentUserCache.get(ctx);
  if (cached) return cached;

  const pending = (async (): Promise<AuthUser | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) return null;
    // Defense in depth: we resolve the Better Auth user purely by the identity's
    // email claim, so an identity whose email is provably unverified must not be
    // trusted to map onto an account. Current providers (email/password, passkey)
    // never assert `emailVerified === false` here; this guard exists so that
    // adding a social provider with unverified emails can't become an
    // account-takeover vector.
    if (identity.emailVerified === false) return null;
    // Prefer subject/_id when present (point lookup) before email scan.
    const subject = typeof identity.subject === "string" ? identity.subject.trim() : "";
    if (subject) {
      let byId = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "_id", value: subject }],
      })) as AuthUser | null;
      if (!byId) {
        byId = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
          model: "user",
          where: [{ field: "id", value: subject }],
        })) as AuthUser | null;
      }
      if (byId) {
        if (byId.banned) return null;
        return byId;
      }
    }
    const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: identity.email }],
    })) as AuthUser | null;
    if (!user) return null;
    if (user.banned) return null;
    return user;
  })();

  currentUserCache.set(ctx, pending);
  return pending;
}

export async function requireAuth(
  ctx: AuthCtx,
): Promise<AuthUser> {
  const user = await getCurrentUserOrNull(ctx);
  if (!user) throw new Error("You must be signed in.");
  return user;
}

export async function requireAdmin(
  ctx: AuthCtx,
): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (user.role !== "admin") {
    throw new Error("Admin access required.");
  }
  return user;
}

export function isAdmin(user: AuthUser | null | undefined): boolean {
  return Boolean(user && user.role === "admin");
}

type AuthOrganization = {
  id?: string;
  _id?: string;
  name?: string;
  slug?: string;
};

export type ActiveOrganizationContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationType: "arbor_internal" | "band" | "dj";//going to have band and dj 
  //basically act as the same
};

function deriveOrganizationType(
  org: AuthOrganization | null | undefined,
): "arbor_internal" | "band" | "dj" {
  const name = (org?.name ?? "").trim().toLowerCase();
  const slug = (org?.slug ?? "").trim().toLowerCase();
  return name === "arbor live" || slug === "arbor-live" ? "arbor_internal" : "band";
}

export async function getActiveOrganizationContextOrNull(
  ctx: AuthCtx,
): Promise<ActiveOrganizationContext | null> {
  const cached = activeOrgCache.get(ctx);
  if (cached) return cached;

  const pending = (async (): Promise<ActiveOrganizationContext | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;
    const userId = getUserId(user);
    if (!userId) return null;

    const memberships = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(100);
    const activeMemberships = memberships.filter((membership) => membership.active);
    if (!activeMemberships.length) return null;
    const activeRow = await ctx.db
      .query("userActiveOrganizations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const selectedOrganizationId = activeRow?.organizationId ?? activeMemberships[0].organizationId;
    const selectedMembership = activeMemberships.find(
      (membership) => membership.organizationId === selectedOrganizationId,
    );
    if (!selectedMembership) return null;

    // Prefer local organizationProfiles before Better Auth org lookups. Auth gates
    // (requireArborInternalContext) only need organizationType; under anonymous /
    // constrained Convex the adapter findOne calls were eating most of the ~1s budget.
    const orgProfile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", selectedOrganizationId))
      .unique();
    if (orgProfile?.organizationType === "arbor_internal") {
      return {
        organizationId: selectedOrganizationId,
        organizationName: "Arbor Live",
        organizationSlug: "arbor-live",
        organizationType: "arbor_internal",
      };
    }
    if (orgProfile?.organizationType === "band" || orgProfile?.organizationType === "dj") {
      // Still need display name/slug from Better Auth for band/dj orgs.
      let org = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "organization",
        where: [{ field: "_id", value: selectedOrganizationId }],
      })) as AuthOrganization | null;
      if (!org) {
        org = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
          model: "organization",
          where: [{ field: "id", value: selectedOrganizationId }],
        })) as AuthOrganization | null;
      }
      return {
        organizationId: selectedOrganizationId,
        organizationName: org?.name ?? "Organization",
        organizationSlug: org?.slug ?? "",
        organizationType: orgProfile.organizationType,
      };
    }

    // Legacy rows without a profile: fall back to Better Auth name/slug derivation.
    let org = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "organization",
      where: [{ field: "_id", value: selectedOrganizationId }],
    })) as AuthOrganization | null;
    if (!org) {
      org = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "organization",
        where: [{ field: "id", value: selectedOrganizationId }],
      })) as AuthOrganization | null;
    }
    return {
      organizationId: selectedOrganizationId,
      organizationName: org?.name ?? "Organization",
      organizationSlug: org?.slug ?? "",
      organizationType:
        deriveOrganizationType(org) === "arbor_internal" ? "arbor_internal" : "band",
    };
  })();

  activeOrgCache.set(ctx, pending);
  return pending;
}

export async function requireActiveOrganizationContext(
  ctx: AuthCtx,
): Promise<ActiveOrganizationContext> {
  const context = await getActiveOrganizationContextOrNull(ctx);
  if (!context) throw new Error("No active organization context.");
  return context;
}

export async function requireArborInternalContext(
  ctx: AuthCtx,
): Promise<ActiveOrganizationContext> {
  const context = await requireActiveOrganizationContext(ctx);
  if (context.organizationType !== "arbor_internal") {
    throw new Error("This area is only available in Arbor internal organization context.");
  }
  return context;
}

export async function requireBandContext(
  ctx: AuthCtx,
): Promise<ActiveOrganizationContext> {
  const context = await requireActiveOrganizationContext(ctx);
  if (context.organizationType !== "band" && context.organizationType !== "dj") {
    throw new Error("This area is only available to bands and DJs.");
  }
  return context;
}

async function getUserAdminProfile(ctx: AuthCtx, userId: string) {
  return await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

export async function getViewerMembership(ctx: AuthCtx) {
  const user = await requireAuth(ctx);
  const profile = await getUserAdminProfile(ctx, getUserId(user));
  return {
    user,
    ...resolveProfileMembership(profile ?? {}),
  };
}

export async function requireVerticalOrAdmin(
  ctx: AuthCtx,
  vertical: UserVertical,
): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (isAdmin(user)) return user;
  const profile = await getUserAdminProfile(ctx, getUserId(user));
  const { verticals } = resolveProfileMembership(profile ?? {});
  if (!hasVertical(verticals, vertical)) {
    throw new Error(`${vertical} team access required.`);
  }
  return user;
}

export async function requireAnyVerticalOrAdmin(
  ctx: AuthCtx,
  candidates: readonly UserVertical[],
): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (isAdmin(user)) return user;
  const profile = await getUserAdminProfile(ctx, getUserId(user));
  const { verticals } = resolveProfileMembership(profile ?? {});
  if (!hasAnyVertical(verticals, candidates)) {
    throw new Error("You do not have access to this area.");
  }
  return user;
}

/** Portal admins whose profile includes the given vertical (for staff inbox emails). */
export async function listAdminEmailsForVertical(
  ctx: AuthCtx,
  vertical: UserVertical,
): Promise<string[]> {
  const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "user",
    paginationOpts: { cursor: null, numItems: 500 },
  });
  const users = (result?.page ?? []) as AuthUser[];
  const emails = new Set<string>();

  for (const user of users) {
    if (user.role !== "admin" || !user.email) continue;
    const userId = getUserId(user);
    if (!userId) continue;
    const profile = await getUserAdminProfile(ctx, userId);
    const { verticals } = resolveProfileMembership(profile ?? {});
    if (!hasVertical(verticals, vertical)) continue;
    emails.add(user.email.trim().toLowerCase());
  }

  return [...emails];
}

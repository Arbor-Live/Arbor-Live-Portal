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

export type AuthUser = {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  role?: string | null;
  banned?: boolean | null;
};

export function getUserId(user: AuthUser): string {
  return user.id ?? user._id ?? "";
}

export async function getCurrentUserOrNull(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthUser | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.email) return null;
  // Defense in depth: we resolve the Better Auth user purely by the identity's
  // email claim, so an identity whose email is provably unverified must not be
  // trusted to map onto an account. Current providers (email/password, passkey)
  // never assert `emailVerified === false` here; this guard exists so that
  // adding a social provider with unverified emails can't become an
  // account-takeover vector.
  if (identity.emailVerified === false) return null;
  const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: identity.email }],
  })) as AuthUser | null;
  if (!user) return null;
  if (user.banned) return null;
  return user;
}

export async function requireAuth(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthUser> {
  const user = await getCurrentUserOrNull(ctx);
  if (!user) throw new Error("You must be signed in.");
  return user;
}

export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
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
  organizationType: "arbor_internal" | "band";
};

function deriveOrganizationType(org: AuthOrganization | null | undefined) {
  const name = (org?.name ?? "").trim().toLowerCase();
  const slug = (org?.slug ?? "").trim().toLowerCase();
  return name === "arbor live" || slug === "arbor-live" ? "arbor_internal" : "band";
}

export async function getActiveOrganizationContextOrNull(
  ctx: QueryCtx | MutationCtx,
): Promise<ActiveOrganizationContext | null> {
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

  // Look up by _id first: the better-auth adapter resolves _id with ctx.db.get
  // (fast path), while `field: "id"` falls back to a scan. This runs on nearly
  // every request, so avoid paging the whole organization table.
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
  const orgProfile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", selectedOrganizationId))
    .unique();
  return {
    organizationId: selectedOrganizationId,
    organizationName: org?.name ?? "Organization",
    organizationSlug: org?.slug ?? "",
    organizationType:
      deriveOrganizationType(org) === "arbor_internal"
        ? "arbor_internal"
        : (orgProfile?.organizationType ?? "band"),
  };
}

export async function requireActiveOrganizationContext(
  ctx: QueryCtx | MutationCtx,
): Promise<ActiveOrganizationContext> {
  const context = await getActiveOrganizationContextOrNull(ctx);
  if (!context) throw new Error("No active organization context.");
  return context;
}

export async function requireArborInternalContext(
  ctx: QueryCtx | MutationCtx,
): Promise<ActiveOrganizationContext> {
  const context = await requireActiveOrganizationContext(ctx);
  if (context.organizationType !== "arbor_internal") {
    throw new Error("This area is only available in Arbor internal organization context.");
  }
  return context;
}

export async function requireBandContext(
  ctx: QueryCtx | MutationCtx,
): Promise<ActiveOrganizationContext> {
  const context = await requireActiveOrganizationContext(ctx);
  if (context.organizationType !== "band") {
    throw new Error("This area is only available in band organization context.");
  }
  return context;
}

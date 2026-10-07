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
  isArtistOrganizationType,
  type ArtistOrganizationType,
} from "./organizationType";
import { resolveGlobalRoleForUser } from "./globalRole";
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
  image?: string | null;
  role?: string | null;
  banned?: boolean | null;
};

type AuthOrganization = {
  id?: string;
  _id?: string;
  name?: string;
  slug?: string;
};

type AuthCtx = QueryCtx | MutationCtx;

/** Per-request memo: most handlers call requireAuth + requireArborInternalContext. */
const currentUserCache = new WeakMap<AuthCtx, Promise<AuthUser | null>>();
const activeOrgCache = new WeakMap<AuthCtx, Promise<ActiveOrganizationContext | null>>();

export function getUserId(user: AuthUser): string {
  return user.id ?? user._id ?? "";
}

/**
 * Point-lookup a Better Auth user by id. Prefer Convex `_id` (fast path) and
 * only fall back to adapter `id` (unindexed scan) when needed.
 */
export async function findAuthUserById(
  ctx: AuthCtx,
  userId: string | undefined | null,
): Promise<AuthUser | null> {
  const id = userId?.trim();
  if (!id) return null;
  let user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "_id", value: id }],
  })) as AuthUser | null;
  if (!user) {
    user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "id", value: id }],
    })) as AuthUser | null;
  }
  return user;
}

/** Point-lookup a Better Auth user by email (used for recipient preferences). */
export async function findAuthUserByEmail(
  ctx: AuthCtx,
  email: string | undefined | null,
): Promise<AuthUser | null> {
  const value = email?.trim().toLowerCase();
  if (!value) return null;
  const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value }],
  })) as AuthUser | null;
  return user ?? null;
}

/**
 * Convex document ids are 32 base32-ish characters. The adapter's `_id` lookup
 * calls `db.get` per value and throws "Unable to decode ID" on anything else, so
 * arbitrary author strings (legacy rows, fixtures) must skip that branch and
 * fall through to the `id` alias query rather than failing the whole caller.
 */
function isConvexIdShaped(value: string) {
  return /^[0-9a-z]{32}$/.test(value);
}

/**
 * Batch-lookup Better Auth users by id. Uses `_id`+`in` first, then `id`+`in`
 * only for ids still missing. Map is keyed by both `_id` and `id` when present.
 *
 * Total by design: unknown or malformed ids are simply absent from the map, so
 * one bad stored id cannot take down a list that only wants display names.
 */
export async function findAuthUsersByIds(
  ctx: AuthCtx,
  userIds: readonly string[],
): Promise<Map<string, AuthUser>> {
  const userByKey = new Map<string, AuthUser>();
  const uniqueIds = [
    ...new Set(userIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  if (uniqueIds.length === 0) return userByKey;

  const indexUser = (user: AuthUser) => {
    if (user.id) userByKey.set(user.id, user);
    if (user._id) userByKey.set(user._id, user);
  };

  const decodableIds = uniqueIds.filter(isConvexIdShaped);
  if (decodableIds.length > 0) {
    const byIdResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      where: [{ field: "_id", operator: "in", value: decodableIds }],
      paginationOpts: { cursor: null, numItems: decodableIds.length },
    });
    for (const user of (byIdResult?.page ?? []) as AuthUser[]) {
      indexUser(user);
    }
  }

  const missing = uniqueIds.filter((id) => !userByKey.has(id));
  if (missing.length > 0) {
    const byAliasResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      where: [{ field: "id", operator: "in", value: missing }],
      paginationOpts: { cursor: null, numItems: missing.length },
    });
    for (const user of (byAliasResult?.page ?? []) as AuthUser[]) {
      indexUser(user);
    }
  }

  return userByKey;
}

/** Prefer `_id` then `id` for Better Auth organization point lookups. */
export async function findAuthOrganizationById(
  ctx: AuthCtx,
  organizationId: string | undefined | null,
): Promise<AuthOrganization | null> {
  const id = organizationId?.trim();
  if (!id) return null;
  let org = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "organization",
    where: [{ field: "_id", value: id }],
  })) as AuthOrganization | null;
  if (!org) {
    org = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "organization",
      where: [{ field: "id", value: id }],
    })) as AuthOrganization | null;
  }
  return org;
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
      const byId = await findAuthUserById(ctx, subject);
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

/**
 * Better Auth `role: "admin"`. This is a *cache* of Arbor-internal membership
 * and has historically been shared by band/DJ org admins, so it is safe only
 * while every membership write resyncs the role (`syncGlobalRoleFromMemberships`).
 * For staff identity, prefer `isPortalAdmin`, which derives from memberships.
 * Never select email recipients by this role — use `listPortalAdminEmails`.
 *
 * Staff access needs both the cached role and an admin-granting membership
 * (`isStaffAdmin`), so a stale cache on a band/DJ admin grants nothing.
 */
export async function requireAdmin(
  ctx: AuthCtx,
): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (!(await isStaffAdmin(ctx, user))) {
    throw new Error("Admin access required.");
  }
  return user;
}

/** See `requireAdmin` — `role` is a membership cache, not proof of staff. */
export function isAdmin(user: AuthUser | null | undefined): boolean {
  return Boolean(user && user.role === "admin");
}

/**
 * Arbor Live staff admin: the cached `role: "admin"` *and* a membership that
 * still grants it. Use this, not `isAdmin`, anywhere access depends on it.
 */
export async function isStaffAdmin(
  ctx: AuthCtx,
  user: AuthUser | null | undefined,
): Promise<boolean> {
  if (!user || !isAdmin(user)) return false;
  return await isPortalAdmin(ctx, getUserId(user));
}

export type ActiveOrganizationContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationType: "arbor_internal" | ArtistOrganizationType;
  /** True when a portal admin is previewing an artist org without membership. */
  isAdminPreview?: boolean;
};

function deriveOrganizationType(
  org: AuthOrganization | null | undefined,
): "arbor_internal" | "band" | "dj" {
  const name = (org?.name ?? "").trim().toLowerCase();
  const slug = (org?.slug ?? "").trim().toLowerCase();
  return name === "arbor live" || slug === "arbor-live" ? "arbor_internal" : "band";
}

/**
 * Resolve org display fields + type for an organization id.
 * Prefer local organizationProfiles before Better Auth org lookups.
 */
export async function resolveOrganizationContext(
  ctx: AuthCtx,
  organizationId: string,
): Promise<ActiveOrganizationContext | null> {
  const orgProfile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  if (orgProfile?.organizationType === "arbor_internal") {
    return {
      organizationId,
      organizationName: "Arbor Live",
      organizationSlug: "arbor-live",
      organizationType: "arbor_internal",
    };
  }
  if (orgProfile?.organizationType && isArtistOrganizationType(orgProfile.organizationType)) {
    const org = await findAuthOrganizationById(ctx, organizationId);
    return {
      organizationId,
      organizationName: org?.name ?? "Organization",
      organizationSlug: org?.slug ?? "",
      organizationType: orgProfile.organizationType,
    };
  }

  const org = await findAuthOrganizationById(ctx, organizationId);
  if (!org) return null;
  return {
    organizationId,
    organizationName: org.name ?? "Organization",
    organizationSlug: org.slug ?? "",
    organizationType:
      deriveOrganizationType(org) === "arbor_internal" ? "arbor_internal" : "band",
  };
}

/**
 * Admins may temporarily activate a band/dj org without membership so they can
 * check the artist portal. Arbor internal still requires real membership.
 */
export async function assertAdminMayPreviewOrganization(
  ctx: AuthCtx,
  organizationId: string,
): Promise<ActiveOrganizationContext> {
  const context = await resolveOrganizationContext(ctx, organizationId);
  if (!context) {
    throw new Error("Organization not found.");
  }
  if (!isArtistOrganizationType(context.organizationType)) {
    throw new Error("Admin preview is only available for artist organizations.");
  }
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  if (profile?.status === "archived") {
    throw new Error("Cannot preview an archived artist organization.");
  }
  return context;
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
    const activeRow = await ctx.db
      .query("userActiveOrganizations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const selectedOrganizationId =
      activeRow?.organizationId ?? activeMemberships[0]?.organizationId;
    if (!selectedOrganizationId) return null;

    const selectedMembership = activeMemberships.find(
      (membership) => membership.organizationId === selectedOrganizationId,
    );
    if (selectedMembership) {
      return await resolveOrganizationContext(ctx, selectedOrganizationId);
    }

    // No membership for the selected active org — allow Arbor Live portal admins
    // to preview artist orgs (temporary view-as, not a lasting join). Gate on
    // membership, not the raw role, so a band org admin can never preview (and
    // then operate on) another artist org.
    if (await isPortalAdmin(ctx, userId)) {
      const preview = await resolveOrganizationContext(ctx, selectedOrganizationId);
      if (preview && isArtistOrganizationType(preview.organizationType)) {
        const profile = await ctx.db
          .query("organizationProfiles")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", selectedOrganizationId),
          )
          .unique();
        if (profile?.status !== "archived") {
          return { ...preview, isAdminPreview: true };
        }
      }
    }

    // Stale preview (archived / invalid): fall back to a real membership.
    if (!activeMemberships.length) return null;
    return await resolveOrganizationContext(
      ctx,
      activeMemberships[0].organizationId,
    );
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
  if (!isArtistOrganizationType(context.organizationType)) {
    throw new Error("This area is only available to artists and DJs.");
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
  if (await isStaffAdmin(ctx, user)) return user;
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
  if (await isStaffAdmin(ctx, user)) return user;
  const profile = await getUserAdminProfile(ctx, getUserId(user));
  const { verticals } = resolveProfileMembership(profile ?? {});
  if (!hasAnyVertical(verticals, candidates)) {
    throw new Error("You do not have access to this area.");
  }
  return user;
}

/** Admins, or members of the Operations team (who book acts, run events and invoices). */
export async function hasOperationsAccess(ctx: AuthCtx, user: AuthUser): Promise<boolean> {
  if (await isStaffAdmin(ctx, user)) return true;
  const profile = await getUserAdminProfile(ctx, getUserId(user));
  return hasVertical(resolveProfileMembership(profile ?? {}).verticals, "Operations");
}

/**
 * Operations work in Arbor Live's context: events, booking acts, invoices and
 * billing hosts. Admins and the Operations team; not crew.
 */
export async function requireOperationsAccess(ctx: AuthCtx): Promise<AuthUser> {
  const user = await requireVerticalOrAdmin(ctx, "Operations");
  await requireArborInternalContext(ctx);
  return user;
}

/**
 * Drop-in for `requireAdmin` on work the Operations team shares: admins pass
 * exactly as before, Operations members only in Arbor Live's context.
 */
export async function requireAdminOrOperations(ctx: AuthCtx): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (await isStaffAdmin(ctx, user)) return user;
  return await requireOperationsAccess(ctx);
}

/**
 * True when an admin is an Arbor Live (portal) admin rather than an artist-org
 * admin. Band/DJ admins share Better Auth `role: "admin"`, so the role alone
 * is not enough to identify staff.
 */
export async function isPortalAdmin(ctx: AuthCtx, userId: string): Promise<boolean> {
  return (await resolveGlobalRoleForUser(ctx, userId)) === "admin";
}

/**
 * Staff access: authenticated *and* a membership-derived portal admin. Prefer
 * this over `requireAdmin`, whose Better Auth role cache is also carried by
 * band/DJ org admins.
 */
export async function requirePortalAdmin(ctx: AuthCtx): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (!(await isPortalAdmin(ctx, getUserId(user)))) {
    throw new Error("Admin access required.");
  }
  return user;
}

/**
 * Every Arbor Live (portal) admin. This is the one audited gate for admin-wide
 * email: band/DJ org admins also carry Better Auth `role: "admin"`, so a bare
 * role check would leak staff email (and any student info in it) to them.
 * Paginates rather than trusting one page so a truncated directory cannot
 * silently drop staff.
 */
async function listPortalAdminUsers(ctx: AuthCtx): Promise<AuthUser[]> {
  const admins: AuthUser[] = [];
  let cursor: string | null = null;
  for (;;) {
    const result = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: { cursor, numItems: 500 },
    })) as { page?: AuthUser[]; isDone?: boolean; continueCursor?: string } | null;

    for (const user of result?.page ?? []) {
      if (user.role !== "admin" || !user.email) continue;
      const userId = getUserId(user);
      if (!userId) continue;
      if (!(await isPortalAdmin(ctx, userId))) continue;
      admins.push(user);
    }

    if (result?.isDone) break;
    cursor = result?.continueCursor ?? null;
    if (!cursor) break;
  }
  return admins;
}

/** Emails of Arbor Live (portal) admins only, never artist-org admins. */
export async function listPortalAdminEmails(ctx: AuthCtx): Promise<string[]> {
  const emails = new Set<string>();
  for (const user of await listPortalAdminUsers(ctx)) {
    if (user.email) emails.add(user.email.trim().toLowerCase());
  }
  return [...emails];
}

/** Portal admins whose profile includes the given vertical (for staff inbox emails). */
export async function listAdminEmailsForVertical(
  ctx: AuthCtx,
  vertical: UserVertical,
): Promise<string[]> {
  const emails = new Set<string>();
  for (const user of await listPortalAdminUsers(ctx)) {
    const userId = getUserId(user);
    const profile = await getUserAdminProfile(ctx, userId);
    const { verticals } = resolveProfileMembership(profile ?? {});
    if (!hasVertical(verticals, vertical)) continue;
    if (user.email) emails.add(user.email.trim().toLowerCase());
  }
  return [...emails];
}

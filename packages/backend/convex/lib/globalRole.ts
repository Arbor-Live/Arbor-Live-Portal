import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Map an organization membership role to the global Better Auth role.
 *
 * Global admin is an Arbor-internal concept only. Every artist organization
 * (band/DJ/etc.) resolves to `member` no matter what org role it passes, so a
 * band `org_admin` can never confer portal-wide privileges.
 */
export async function resolveGlobalRoleForOrganization(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  membershipRole: string | undefined,
): Promise<"admin" | "member"> {
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  if (
    profile?.organizationType === "arbor_internal" &&
    (membershipRole === "org_admin" || membershipRole === "admin")
  ) {
    return "admin";
  }
  return "member";
}

/** A person is not in 100 organizations. Past this, refuse a partial role calc. */
const MAX_USER_ORG_MEMBERSHIPS = 100;

/**
 * Global role derived from a user's existing memberships alone. Used to audit
 * (and backfill) the Better Auth role, never to grant a role the memberships do
 * not already justify.
 *
 * `admin` requires an active Arbor-internal membership with an admin role. A
 * user with no membership rows at all is a legacy admin provisioned before
 * organizations existed and keeps `admin`; a user left with only artist-org
 * memberships resolves to `member`, so a band/DJ `org_admin` cannot keep
 * portal-wide privileges.
 */
export async function resolveGlobalRoleForUser(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<"admin" | "member"> {
  const rows = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_USER_ORG_MEMBERSHIPS + 1);
  if (rows.length > MAX_USER_ORG_MEMBERSHIPS) {
    throw new Error(
      `Cannot resolve global role: user has ${rows.length} organization memberships (max ${MAX_USER_ORG_MEMBERSHIPS}).`,
    );
  }
  if (rows.length === 0) return "admin";
  for (const membership of rows) {
    if (!membership.active) continue;
    const role = await resolveGlobalRoleForOrganization(
      ctx,
      membership.organizationId,
      membership.role,
    );
    if (role === "admin") return "admin";
  }
  return "member";
}

/**
 * Global role from the user's active memberships, with NO legacy exception:
 * a user with no admin-granting membership resolves to `member`.
 *
 * Use when the caller has just changed memberships (add/remove/edit). The
 * "no memberships keeps admin" rule of `resolveGlobalRoleForUser` is only for
 * auditing pre-existing rows; applying it after a removal would promote a user
 * whose last membership was just deleted.
 */
export async function resolveGlobalRoleFromActiveMemberships(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<"admin" | "member"> {
  const rows = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_USER_ORG_MEMBERSHIPS + 1);
  if (rows.length > MAX_USER_ORG_MEMBERSHIPS) {
    throw new Error(
      `Cannot resolve global role: user has ${rows.length} organization memberships (max ${MAX_USER_ORG_MEMBERSHIPS}).`,
    );
  }
  for (const membership of rows) {
    if (!membership.active) continue;
    const role = await resolveGlobalRoleForOrganization(
      ctx,
      membership.organizationId,
      membership.role,
    );
    if (role === "admin") return "admin";
  }
  return "member";
}

export function activeMembershipsForGlobalRole(
  existing: Array<{ organizationId: string; role: string; active: boolean }>,
  next: { organizationId: string; role: string },
): Array<{ organizationId: string; role: string }> {
  const kept: Array<{ organizationId: string; role: string }> = [];
  for (const row of existing) {
    if (!row.active || row.organizationId === next.organizationId) continue;
    kept.push({ organizationId: row.organizationId, role: row.role });
  }
  kept.push(next);
  return kept;
}

/**
 * Global role for a user who already has an account. The membership being
 * written replaces any row for that organization; every other active
 * membership still counts, so adding an Arbor admin to a band does not
 * strip platform admin.
 */
export async function resolveGlobalRoleForExistingUser(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  nextMembership: { organizationId: string; role: string },
): Promise<"admin" | "member"> {
  const rows = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_USER_ORG_MEMBERSHIPS + 1);
  if (rows.length > MAX_USER_ORG_MEMBERSHIPS) {
    throw new Error(
      `Cannot recompute global role: user has ${rows.length} organization memberships (max ${MAX_USER_ORG_MEMBERSHIPS}).`,
    );
  }
  const candidates = activeMembershipsForGlobalRole(rows, nextMembership);
  for (const membership of candidates) {
    const role = await resolveGlobalRoleForOrganization(
      ctx,
      membership.organizationId,
      membership.role,
    );
    if (role === "admin") return "admin";
  }
  return "member";
}

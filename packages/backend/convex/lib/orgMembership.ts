import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Far past any org's real roster (Arbor's crew is a few hundred; band orgs are
 * tens). Past it we throw instead of returning a partial member set.
 */
const MAX_ORG_MEMBERSHIPS = 5_000;

/**
 * Every membership row for an org (active or not). Bounded read with a loud cap
 * instead of a cursor loop — a query/mutation may only run one paginated query.
 */
export async function loadOrgMembershipsForOrganization(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<Doc<"userOrganizationMemberships">[]> {
  const memberships = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(MAX_ORG_MEMBERSHIPS + 1);
  if (memberships.length > MAX_ORG_MEMBERSHIPS) {
    throw new Error(
      `userOrganizationMemberships for ${organizationId} exceeded ${MAX_ORG_MEMBERSHIPS} rows; refusing to return a partial list.`,
    );
  }
  return memberships;
}

/**
 * Active membership user IDs for an org. Bounded read with a loud cap instead
 * of a cursor loop — a query/mutation may only run one paginated query.
 */
export async function loadActiveOrgMemberUserIds(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<Set<string>> {
  const memberships = await loadOrgMembershipsForOrganization(ctx, organizationId);
  const orgUserIds = new Set<string>();
  for (const membership of memberships) {
    if (membership.active) orgUserIds.add(membership.userId);
  }
  return orgUserIds;
}

/** Every membership row; far above the roster, inside Convex's 32k-document read limit. */
const MAX_ALL_ORG_MEMBERSHIPS = 15_000;

/**
 * Each user's organization memberships, from one bounded read of the whole
 * table (a single index range). One `by_userId` read per user would hit
 * Convex's 4,096 index-range limit once the roster (alumni are kept forever)
 * passed a few thousand people. Throws rather than returning a partial list.
 * Every requested user maps to their rows, an empty list when they have none.
 */
export async function loadOrgMembershipsByUserIds(
  ctx: QueryCtx | MutationCtx,
  userIds: Iterable<string>,
): Promise<Map<string, Doc<"userOrganizationMemberships">[]>> {
  const rows = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_userId")
    .take(MAX_ALL_ORG_MEMBERSHIPS + 1);
  if (rows.length > MAX_ALL_ORG_MEMBERSHIPS) {
    throw new Error(
      `userOrganizationMemberships exceeded ${MAX_ALL_ORG_MEMBERSHIPS} rows; refusing to return a partial list.`,
    );
  }
  const byUserId = new Map<string, Doc<"userOrganizationMemberships">[]>();
  for (const userId of userIds) {
    if (userId) byUserId.set(userId, []);
  }
  for (const row of rows) {
    byUserId.get(row.userId)?.push(row);
  }
  return byUserId;
}

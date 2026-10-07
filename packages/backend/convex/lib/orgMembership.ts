import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Far past any org's real roster (Arbor's crew is a few hundred; band orgs are
 * tens). Past it we throw instead of returning a partial member set.
 */
const MAX_ORG_MEMBERSHIPS = 5_000;

/**
 * Active membership user IDs for an org. Bounded read with a loud cap instead
 * of a cursor loop — a query/mutation may only run one paginated query.
 */
export async function loadActiveOrgMemberUserIds(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<Set<string>> {
  const memberships = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(MAX_ORG_MEMBERSHIPS + 1);
  if (memberships.length > MAX_ORG_MEMBERSHIPS) {
    throw new Error(
      `userOrganizationMemberships for ${organizationId} exceeded ${MAX_ORG_MEMBERSHIPS} rows; refusing to return a partial list.`,
    );
  }
  const orgUserIds = new Set<string>();
  for (const membership of memberships) {
    if (membership.active) orgUserIds.add(membership.userId);
  }
  return orgUserIds;
}

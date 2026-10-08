import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Far past any org's real roster (Arbor's crew is a few hundred; band orgs are
 * tens). Past it we throw instead of returning a partial member set.
 */
const MAX_ORG_MEMBERSHIPS = 5_000;

/** A person is not in 100 organizations (same ceiling as `lib/globalRole.ts`). */
const MAX_USER_ORG_MEMBERSHIPS = 100;

/**
 * Stay well under Convex's 1,000 concurrent I/O ops per function when fanning
 * out one membership read per user.
 */
const MEMBERSHIP_LOOKUP_CHUNK = 200;

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

/**
 * Each user's organization memberships, read through `by_userId` with an
 * equality bound — one indexed read per user instead of a single eq-less table
 * scan that silently truncates. Bounded per user with a loud cap, read in
 * chunks to stay under Convex's concurrent I/O limit. Every requested user
 * maps to their rows — an empty list when they have none.
 */
export async function loadOrgMembershipsByUserIds(
  ctx: QueryCtx | MutationCtx,
  userIds: Iterable<string>,
): Promise<Map<string, Doc<"userOrganizationMemberships">[]>> {
  const ids = [...new Set(userIds)].filter((id) => id.length > 0);
  const byUserId = new Map<string, Doc<"userOrganizationMemberships">[]>();
  for (let start = 0; start < ids.length; start += MEMBERSHIP_LOOKUP_CHUNK) {
    const chunk = ids.slice(start, start + MEMBERSHIP_LOOKUP_CHUNK);
    const rows = await Promise.all(
      chunk.map((userId) =>
        ctx.db
          .query("userOrganizationMemberships")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .take(MAX_USER_ORG_MEMBERSHIPS + 1),
      ),
    );
    chunk.forEach((userId, index) => {
      const memberships = rows[index]!;
      if (memberships.length > MAX_USER_ORG_MEMBERSHIPS) {
        throw new Error(
          `userOrganizationMemberships for ${userId} exceeded ${MAX_USER_ORG_MEMBERSHIPS} rows; refusing to return a partial list.`,
        );
      }
      byUserId.set(userId, memberships);
    });
  }
  return byUserId;
}

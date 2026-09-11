import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Active membership user IDs for an org (paginated — no silent take cap). */
export async function loadActiveOrgMemberUserIds(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<Set<string>> {
  const orgUserIds = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const page = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .paginate({ cursor, numItems: 500 });
    for (const membership of page.page) {
      if (membership.active) orgUserIds.add(membership.userId);
    }
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  return orgUserIds;
}

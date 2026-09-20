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

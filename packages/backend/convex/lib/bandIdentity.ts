import type { MutationCtx, QueryCtx } from "../_generated/server";
import { findAuthOrganizationById } from "./auth";

/**
 * Display name for a band organization: the profile display name when set,
 * otherwise the Better Auth organization name.
 */
export async function resolveBandName(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<string> {
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  const displayName = profile?.displayName?.trim();
  if (displayName) return displayName;

  const org = await findAuthOrganizationById(ctx, organizationId);
  const orgName = org?.name?.trim();
  if (orgName) return orgName;

  return "Band";
}

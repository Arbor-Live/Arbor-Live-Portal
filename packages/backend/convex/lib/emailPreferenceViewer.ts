import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isPortalAdmin } from "./auth";
import {
  listApplicableEmailPreferences,
  resolveDisabledEmailTemplates,
  type EmailPreferenceApplicability,
} from "./emailPreferences";
import { isArtistOrganizationType } from "./organizationType";
import { resolveParticipationFlags } from "./userParticipation";
import { resolveProfileMembership } from "./userVerticals";

type DbCtx = QueryCtx | MutationCtx;

export type UserEmailPreference = {
  template: string;
  label: string;
  group: string;
  enabled: boolean;
};

async function userHasArtistOrgMembership(ctx: DbCtx, userId: string): Promise<boolean> {
  const memberships = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(200);
  for (const membership of memberships) {
    if (!membership.active) continue;
    const orgProfile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", membership.organizationId))
      .unique();
    if (isArtistOrganizationType(orgProfile?.organizationType)) return true;
  }
  return false;
}

export async function resolveEmailPreferenceViewer(
  ctx: DbCtx,
  userId: string,
): Promise<EmailPreferenceApplicability> {
  const profile = await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  const membership = resolveProfileMembership(profile ?? {});
  const flags = resolveParticipationFlags(profile);
  return {
    isPortalAdmin: await isPortalAdmin(ctx, userId),
    verticals: membership.verticals,
    assignableAsCrew: flags.assignableAsCrew,
    isArtistMember: await userHasArtistOrgMembership(ctx, userId),
  };
}

/** Applicable email templates for any user, with their current on/off state. */
export async function listUserEmailPreferences(
  ctx: DbCtx,
  userId: string,
): Promise<UserEmailPreference[]> {
  const profile = await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  const viewer = await resolveEmailPreferenceViewer(ctx, userId);
  const disabled = resolveDisabledEmailTemplates(profile);
  return listApplicableEmailPreferences(viewer).map((definition) => ({
    template: definition.template,
    label: definition.label,
    group: definition.group,
    enabled: !disabled.has(definition.template),
  }));
}

import type { MutationCtx, QueryCtx } from "../_generated/server";
import { findAuthOrganizationById } from "./auth";

export type BandIdentityContact = {
  name?: string;
  email?: string;
  phone?: string;
};

export type BandIdentity = {
  name: string;
  /** Profile-level main contact; undefined when the band has not set one. */
  contact?: BandIdentityContact;
};

/**
 * Display name plus the band's profile-level main contact. The contact is the
 * fallback used when a rider carries no contact of its own.
 */
export async function loadBandIdentity(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<BandIdentity> {
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();

  let name = profile?.displayName?.trim();
  if (!name) {
    const org = await findAuthOrganizationById(ctx, organizationId);
    name = org?.name?.trim();
  }

  const contact: BandIdentityContact = {
    name: profile?.mainContactName?.trim() || undefined,
    email: profile?.mainContactEmail?.trim() || undefined,
    phone: profile?.mainContactPhone?.trim() || undefined,
  };

  return {
    name: name || "Band",
    contact: contact.name || contact.email || contact.phone ? contact : undefined,
  };
}

/**
 * Display name for a band organization: the profile display name when set,
 * otherwise the Better Auth organization name.
 */
export async function resolveBandName(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<string> {
  return (await loadBandIdentity(ctx, organizationId)).name;
}

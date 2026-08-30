import { components } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  markInvitationAccepted,
  scheduleUserInviteEmail,
} from "../email/invitations";
import { ensureOrganizationOnboarding, ensureOnboardingForOrgMembership } from "../onboarding";
import {
  ensureUserProfileDefaults,
  getAuthRecordId,
  resolveOrCreateOrganization,
  upsertOrgMembership,
} from "../users";
import { getUserId, type AuthUser } from "./auth";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function toSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function inviteEmailToBandOrg(
  ctx: MutationCtx,
  args: {
    email: string;
    organizationId: string;
    role: "org_admin" | "org_member";
    inviterId: string;
    /** When true, do not overwrite an existing user's default org (multi-band). */
    preserveDefaultOrganization: boolean;
    bandRole?: string;
  },
) {
  const email = normalizeEmail(args.email);
  if (!email || !isValidEmail(email)) return null;

  const now = Date.now();
  const expiresAt = now + 14 * 24 * 60 * 60 * 1000;
  const created = await ctx.runMutation(components.betterAuth.adapter.create, {
    input: {
      model: "invitation",
      data: {
        organizationId: args.organizationId,
        email,
        role: args.role,
        status: "pending",
        expiresAt,
        createdAt: now,
        inviterId: args.inviterId,
      },
    },
  });
  const invitationId = getAuthRecordId(created as { id?: string; _id?: string });

  const existingUser = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email }],
  })) as AuthUser | null;
  const existingUserId = existingUser ? getUserId(existingUser) : "";

  if (existingUserId) {
    await ensureUserProfileDefaults(ctx, existingUserId, {
      active: true,
      verticals: [],
      disciplines: [],
      defaultOrganizationId: args.preserveDefaultOrganization
        ? undefined
        : args.organizationId,
    });
    await upsertOrgMembership(ctx, {
      userId: existingUserId,
      organizationId: args.organizationId,
      role: args.role,
      active: true,
      bandRole: args.bandRole,
    });
    await ensureOnboardingForOrgMembership(ctx, {
      userId: existingUserId,
      organizationId: args.organizationId,
    });
    await markInvitationAccepted(ctx, invitationId);
  }

  await scheduleUserInviteEmail(ctx, {
    invitationId,
    email,
    organizationId: args.organizationId,
    role: args.role,
    bandRole: args.bandRole,
    inviterId: args.inviterId,
    expiresAt,
    isExistingUser: Boolean(existingUserId),
  });

  return { invitationId, email, isExistingUser: Boolean(existingUserId), expiresAt };
}

export async function provisionBandOrganization(
  ctx: MutationCtx,
  args: {
    displayName: string;
    contactEmail: string;
    contactName?: string;
    /** When true, refuse to reuse an org whose slug matches the display name. */
    rejectExistingOrganization?: boolean;
  },
) {
  const displayName = args.displayName.trim();
  const contactEmail = normalizeEmail(args.contactEmail);
  if (!displayName) throw new Error("Enter an artist or band name.");
  if (!isValidEmail(contactEmail)) throw new Error("Enter a valid email address.");

  if (args.rejectExistingOrganization) {
    const slug = toSlug(displayName);
    const existingOrg = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "organization",
      where: [{ field: "slug", value: slug }],
    })) as { id?: string; _id?: string } | null;
    if (existingOrg) {
      throw new Error(
        'A band with this name already exists. Use "Add band" to assign an existing band.',
      );
    }
  }

  const now = Date.now();
  const resolved = await resolveOrCreateOrganization(ctx, displayName);
  const existingProfile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", resolved.id))
    .unique();

  const profileFields = {
    organizationType: "band" as const,
    displayName,
    mainContactEmail: contactEmail,
    mainContactName: args.contactName?.trim() || undefined,
    status: "active" as const,
    publicListing: false,
    updatedAt: now,
  };

  if (existingProfile) {
    await ctx.db.patch(existingProfile._id, {
      ...profileFields,
      displayName: existingProfile.displayName?.trim() ? existingProfile.displayName : displayName,
      mainContactEmail: existingProfile.mainContactEmail?.trim()
        ? existingProfile.mainContactEmail
        : contactEmail,
    });
  } else {
    await ctx.db.insert("organizationProfiles", {
      organizationId: resolved.id,
      ...profileFields,
    });
  }

  await ensureOrganizationOnboarding(ctx, resolved.id);
  const onboarding = await ctx.db
    .query("organizationOnboarding")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", resolved.id))
    .unique();
  if (onboarding && onboarding.status === "not_started") {
    const patch: Partial<Doc<"organizationOnboarding">> = {
      status: "in_progress",
      updatedAt: now,
    };
    await ctx.db.patch(onboarding._id, patch);
  }

  return { organizationId: resolved.id, displayName, contactEmail };
}

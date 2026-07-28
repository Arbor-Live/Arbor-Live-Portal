import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  getUserId,
  listAdminEmailsForVertical,
  requireAdmin,
  type AuthUser,
} from "./lib/auth";
import {
  bandApplicationsAdminUrl,
  SITE_URL,
  subjectForTemplate,
} from "./email/constants";
import { enqueueEmail } from "./email/enqueue";
import {
  markInvitationAccepted,
  scheduleUserInviteEmail,
} from "./email/invitations";
import { ensureOrganizationOnboarding } from "./onboarding";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";
import {
  ensureUserProfileDefaults,
  getAuthRecordId,
  resolveOrCreateOrganization,
  upsertOrgMembership,
} from "./users";

const memberValue = v.object({
  name: v.string(),
  email: v.optional(v.string()),
});

const applicationStatusValue = v.union(
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("declined"),
);

function trimOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isStanfordEmail(email: string) {
  return /^[^\s@]+@(?:stanford\.edu|alumni\.stanford\.edu)$/i.test(email.trim());
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function scheduleApplicationReceivedEmails(
  ctx: MutationCtx,
  args: {
    applicationId: string;
    bandName: string;
    contactName: string;
    contactEmail: string;
  },
) {
  const recipients = await listAdminEmailsForVertical(ctx, "Crew");
  const reviewUrl = bandApplicationsAdminUrl();
  for (const to of recipients) {
    await enqueueEmail(ctx, {
      template: "band_application_received",
      to,
      subject: subjectForTemplate("band_application_received", args.bandName),
      idempotencyKey: `band_application_received:${args.applicationId}:${to}`,
      payload: {
        bandName: args.bandName,
        contactName: args.contactName,
        contactEmail: args.contactEmail,
        reviewUrl,
      },
    });
  }
}

async function inviteEmailToOrg(
  ctx: MutationCtx,
  args: {
    email: string;
    organizationId: string;
    role: "org_admin" | "org_member";
    inviterId: string;
    /** When true, do not overwrite an existing user's default org (multi-band). */
    preserveDefaultOrganization: boolean;
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
    });
    await markInvitationAccepted(ctx, invitationId);
  } else {
    // New accounts still get this org as default when they accept.
  }

  await scheduleUserInviteEmail(ctx, {
    invitationId,
    email,
    organizationId: args.organizationId,
    role: args.role,
    inviterId: args.inviterId,
    expiresAt,
    isExistingUser: Boolean(existingUserId),
  });

  return { invitationId, email, isExistingUser: Boolean(existingUserId), expiresAt };
}

export const submitPublic = mutation({
  args: {
    website: v.optional(v.string()),
    contactName: v.string(),
    contactEmail: v.string(),
    contactPhone: v.optional(v.string()),
    bandDisplayName: v.string(),
    oneLiner: v.optional(v.string()),
    bio: v.optional(v.string()),
    publicWebsiteUrl: v.optional(v.string()),
    publicInstagramUrl: v.optional(v.string()),
    publicYoutubeUrl: v.optional(v.string()),
    demoURL: v.optional(v.string()),
    publicHeroImageUrl: v.optional(v.string()),
    genres: v.optional(v.array(v.string())),
    isSolo: v.boolean(),
    members: v.array(memberValue),
  },
  returns: v.object({ applicationId: v.id("bandApplications") }),
  handler: async (ctx, args) => {
    if (args.website?.trim()) {
      // Honeypot — pretend success without writing.
      throw new Error("Unable to submit application.");
    }

    const contactName = args.contactName.trim();
    const contactEmail = normalizeEmail(args.contactEmail);
    const bandDisplayName = args.bandDisplayName.trim();
    if (!contactName) throw new Error("Enter your name.");
    if (!isStanfordEmail(contactEmail)) {
      throw new Error("Use a @stanford.edu email address.");
    }
    if (!bandDisplayName) throw new Error("Enter your band name.");

    const members = args.isSolo
      ? []
      : args.members
          .map((member) => ({
            name: member.name.trim(),
            email: trimOptional(member.email)?.toLowerCase(),
          }))
          .filter((member) => member.name.length > 0);

    if (!args.isSolo && members.length === 0) {
      throw new Error("Add at least one bandmate, or mark that you perform solo.");
    }
    for (const member of members) {
      if (member.email && !isValidEmail(member.email)) {
        throw new Error(`Invalid email for ${member.name}.`);
      }
    }

    await enforceRateLimit(ctx, `bandApply:${contactEmail}`, { limit: 3, windowMs: HOUR_MS });
    await enforceRateLimit(ctx, "bandApply:global", { limit: 40, windowMs: HOUR_MS });

    const now = Date.now();
    const applicationId = await ctx.db.insert("bandApplications", {
      status: "submitted",
      contactName,
      contactEmail,
      contactPhone: trimOptional(args.contactPhone),
      bandDisplayName,
      oneLiner: trimOptional(args.oneLiner),
      bio: trimOptional(args.bio),
      publicWebsiteUrl: trimOptional(args.publicWebsiteUrl),
      publicInstagramUrl: trimOptional(args.publicInstagramUrl),
      publicYoutubeUrl: trimOptional(args.publicYoutubeUrl),
      demoURL: trimOptional(args.demoURL),
      publicHeroImageUrl: trimOptional(args.publicHeroImageUrl),
      genres: args.genres?.map((g) => g.trim()).filter(Boolean),
      isSolo: args.isSolo,
      members,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await scheduleApplicationReceivedEmails(ctx, {
      applicationId,
      bandName: bandDisplayName,
      contactName,
      contactEmail,
    });

    await enqueueEmail(ctx, {
      template: "band_application_confirmation",
      to: contactEmail,
      subject: subjectForTemplate("band_application_confirmation", bandDisplayName),
      idempotencyKey: `band_application_confirmation:${applicationId}`,
      payload: {
        recipientName: contactName.split(" ")[0] ?? contactName,
        bandName: bandDisplayName,
      },
    });

    return { applicationId };
  },
});

export const listAdmin = query({
  args: {
    status: v.optional(applicationStatusValue),
  },
  returns: v.array(
    v.object({
      _id: v.id("bandApplications"),
      status: applicationStatusValue,
      contactName: v.string(),
      contactEmail: v.string(),
      contactPhone: v.optional(v.string()),
      bandDisplayName: v.string(),
      oneLiner: v.optional(v.string()),
      bio: v.optional(v.string()),
      publicWebsiteUrl: v.optional(v.string()),
      publicInstagramUrl: v.optional(v.string()),
      publicYoutubeUrl: v.optional(v.string()),
      demoURL: v.optional(v.string()),
      publicHeroImageUrl: v.optional(v.string()),
      genres: v.optional(v.array(v.string())),
      isSolo: v.boolean(),
      members: v.array(memberValue),
      submittedAt: v.number(),
      reviewedAt: v.optional(v.number()),
      declineReason: v.optional(v.string()),
      organizationId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = args.status
      ? await ctx.db
          .query("bandApplications")
          .withIndex("by_status_and_submittedAt", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(200)
      : await ctx.db.query("bandApplications").withIndex("by_submittedAt").order("desc").take(200);

    return rows
      .map((row) => ({
        _id: row._id,
        status: row.status,
        contactName: row.contactName,
        contactEmail: row.contactEmail,
        contactPhone: row.contactPhone,
        bandDisplayName: row.bandDisplayName,
        oneLiner: row.oneLiner,
        bio: row.bio,
        publicWebsiteUrl: row.publicWebsiteUrl,
        publicInstagramUrl: row.publicInstagramUrl,
        publicYoutubeUrl: row.publicYoutubeUrl,
        demoURL: row.demoURL,
        publicHeroImageUrl: row.publicHeroImageUrl,
        genres: row.genres,
        isSolo: row.isSolo,
        members: row.members,
        submittedAt: row.submittedAt,
        reviewedAt: row.reviewedAt,
        declineReason: row.declineReason,
        organizationId: row.organizationId,
      }));
  },
});

export const countPendingSubmitted = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("bandApplications")
      .withIndex("by_status", (q) => q.eq("status", "submitted"))
      .take(200);
    return rows.length;
  },
});

export const approve = mutation({
  args: { applicationId: v.id("bandApplications") },
  returns: v.object({ organizationId: v.string() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const adminId = getUserId(admin);
    if (!adminId) throw new Error("Unable to resolve admin user.");

    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("Application not found.");
    if (application.status !== "submitted") {
      throw new Error("Only submitted applications can be approved.");
    }

    const now = Date.now();
    const resolved = await resolveOrCreateOrganization(ctx, application.bandDisplayName);
    const existingProfile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", resolved.id))
      .unique();

    const bandMemberNames = application.isSolo
      ? [application.contactName]
      : [
          application.contactName,
          ...application.members.map((member) => member.name),
        ].filter(Boolean);

    const profileFields = {
      organizationType: "band" as const,
      displayName: application.bandDisplayName,
      bio: application.bio,
      oneLiner: application.oneLiner,
      publicWebsiteUrl: application.publicWebsiteUrl,
      publicInstagramUrl: application.publicInstagramUrl,
      publicYoutubeUrl: application.publicYoutubeUrl,
      demoURL: application.demoURL,
      publicHeroImageUrl: application.publicHeroImageUrl,
      genres: application.genres,
      mainContactName: application.contactName,
      mainContactEmail: application.contactEmail,
      mainContactPhone: application.contactPhone,
      bandMembers: bandMemberNames,
      status: "active",
      publicListing: false,
      updatedAt: now,
    };

    if (existingProfile) {
      await ctx.db.patch(existingProfile._id, profileFields);
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
    if (onboarding) {
      // Do not stamp identityCompletedAt — name is prefilled from the
      // application, but the band still needs the identity step for bio.
      const stampPatch: Partial<Doc<"organizationOnboarding">> = {
        status: "in_progress",
        updatedAt: now,
      };
      if (application.publicHeroImageUrl) stampPatch.heroCompletedAt = now;
      if (
        application.publicWebsiteUrl ||
        application.publicInstagramUrl ||
        application.publicYoutubeUrl ||
        application.demoURL
      ) {
        stampPatch.socialsCompletedAt = now;
      }
      if (application.isSolo) {
        stampPatch.soloAcknowledgedAt = now;
        stampPatch.membersCompletedAt = now;
      } else {
        stampPatch.membersCompletedAt = now;
      }
      await ctx.db.patch(onboarding._id, stampPatch);
    }

    const contactInvite = await inviteEmailToOrg(ctx, {
      email: application.contactEmail,
      organizationId: resolved.id,
      role: "org_admin",
      inviterId: adminId,
      // Existing users may already belong to other bands — keep their default.
      preserveDefaultOrganization: true,
    });

    const invitedEmails = new Set<string>([normalizeEmail(application.contactEmail)]);
    if (!application.isSolo) {
      for (const member of application.members) {
        const email = member.email ? normalizeEmail(member.email) : "";
        if (!email || invitedEmails.has(email)) continue;
        invitedEmails.add(email);
        await inviteEmailToOrg(ctx, {
          email,
          organizationId: resolved.id,
          role: "org_member",
          inviterId: adminId,
          preserveDefaultOrganization: true,
        });
      }
    }

    await ctx.db.patch(application._id, {
      status: "approved",
      reviewedAt: now,
      reviewedByUserId: adminId,
      organizationId: resolved.id,
      updatedAt: now,
    });

    const acceptInviteUrl = `${SITE_URL}/sign-in?email=${encodeURIComponent(application.contactEmail)}&redirect=${encodeURIComponent("/onboarding/band")}`;

    await enqueueEmail(ctx, {
      template: "band_application_approved",
      to: application.contactEmail,
      subject: subjectForTemplate("band_application_approved", application.bandDisplayName),
      idempotencyKey: `band_application_approved:${application._id}`,
      payload: {
        recipientName: application.contactName.split(" ")[0] ?? application.contactName,
        bandName: application.bandDisplayName,
        acceptInviteUrl,
      },
    });

    return { organizationId: resolved.id };
  },
});

export const decline = mutation({
  args: {
    applicationId: v.id("bandApplications"),
    declineReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const adminId = getUserId(admin);
    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("Application not found.");
    if (application.status !== "submitted") {
      throw new Error("Only submitted applications can be declined.");
    }

    const now = Date.now();
    const declineReason = trimOptional(args.declineReason);
    await ctx.db.patch(application._id, {
      status: "declined",
      reviewedAt: now,
      reviewedByUserId: adminId || undefined,
      declineReason,
      updatedAt: now,
    });

    await enqueueEmail(ctx, {
      template: "band_application_declined",
      to: application.contactEmail,
      subject: subjectForTemplate("band_application_declined", application.bandDisplayName),
      idempotencyKey: `band_application_declined:${application._id}`,
      payload: {
        recipientName: application.contactName.split(" ")[0] ?? application.contactName,
        bandName: application.bandDisplayName,
        declineReason,
      },
    });

    return null;
  },
});

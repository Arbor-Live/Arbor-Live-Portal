import { v } from "convex/values";
import { hashPassword } from "better-auth/crypto";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";

const defaultOrganizationName = "Arbor Live";

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getId(record: unknown): string | null {
  if (!record || typeof record !== "object") return null;
  const candidate = record as { id?: unknown; _id?: unknown };
  if (typeof candidate.id === "string") return candidate.id;
  if (typeof candidate._id === "string") return candidate._id;
  return null;
}

export const isSetupAvailable = query({
  args: {},
  returns: v.object({ available: v.boolean() }),
  handler: async (ctx) => {
    const existingAdmin = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "role", value: "admin" }],
    });
    return { available: !existingAdmin };
  },
});

/**
 * Creates the first admin when none exist. Public (no auth) — gated by
 * "zero admins" only. Idempotent for the same email; never mints a second admin.
 */
export const setupFirstAdmin = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    organizationName: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    email: v.string(),
    role: v.string(),
    organizationId: v.string(),
    organizationName: v.string(),
    organizationSlug: v.string(),
    organizationType: v.string(),
  }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const name = args.name.trim();
    if (!email) throw new Error("Email is required.");
    if (!name) throw new Error("Name is required.");
    if (args.password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const existingAdmin = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "role", value: "admin" }],
    });
    const existingAdminEmail =
      existingAdmin && typeof existingAdmin === "object" && "email" in existingAdmin
        ? (existingAdmin as { email?: string }).email
        : undefined;
    if (existingAdmin && existingAdminEmail?.toLowerCase() !== email) {
      throw new Error("An admin account already exists. Setup is disabled.");
    }

    const organizationName = args.organizationName ?? defaultOrganizationName;
    const now = Date.now();

    const existingUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    });

    let userId = getId(existingUser);

    if (!existingUser) {
      const createdUser = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "user",
          data: {
            name,
            email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
            role: "admin",
          },
        },
      });
      userId = getId(createdUser);
    } else {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "user",
          where: [{ field: "email", value: email }],
          update: { role: "admin", name, updatedAt: now, emailVerified: true },
        },
      });
    }

    if (!userId) {
      throw new Error("Unable to resolve user ID for setup account.");
    }

    const existingCredentialAccount = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "account",
        where: [
          { field: "providerId", value: "credential" },
          { connector: "AND", field: "accountId", value: email },
        ],
      },
    );

    if (!existingCredentialAccount) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "account",
          data: {
            accountId: email,
            providerId: "credential",
            userId,
            password: await hashPassword(args.password),
            createdAt: now,
            updatedAt: now,
          },
        },
      });
    }

    const orgSlug = toSlug(organizationName);
    const existingOrg = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "organization",
      where: [{ field: "slug", value: orgSlug }],
    });

    let organizationId = getId(existingOrg);
    if (!organizationId) {
      const createdOrg = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "organization",
          data: { name: organizationName, slug: orgSlug, createdAt: now },
        },
      });
      organizationId = getId(createdOrg);
    }

    if (!organizationId) {
      throw new Error("Unable to resolve organization ID for setup account.");
    }

    const existingMember = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "member",
      where: [
        { field: "organizationId", value: organizationId },
        { connector: "AND", field: "userId", value: userId },
      ],
    });

    if (!existingMember) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "member",
          data: {
            organizationId,
            userId,
            role: "admin",
            createdAt: now,
          },
        },
      });
    } else {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "member",
          where: [
            { field: "organizationId", value: organizationId },
            { connector: "AND", field: "userId", value: userId },
          ],
          update: { role: "admin" },
        },
      });
    }

    const organizationType = orgSlug === "arbor-live" ? "arbor_internal" : "band";
    const existingOrgProfile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (existingOrgProfile) {
      await ctx.db.patch(existingOrgProfile._id, {
        organizationType,
        displayName: existingOrgProfile.displayName ?? organizationName,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("organizationProfiles", {
        organizationId,
        organizationType,
        displayName: organizationName,
        updatedAt: now,
      });
    }

    const existingAppMembership = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", userId).eq("organizationId", organizationId),
      )
      .unique();
    if (existingAppMembership) {
      await ctx.db.patch(existingAppMembership._id, {
        role: "admin",
        active: true,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userOrganizationMemberships", {
        userId,
        organizationId,
        role: "admin",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingUserProfile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existingUserProfile) {
      await ctx.db.patch(existingUserProfile._id, {
        active: true,
        defaultOrganizationId: organizationId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userAdminProfiles", {
        userId,
        active: true,
        verticals: [],
        disciplines: [],
        defaultOrganizationId: organizationId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingActiveOrg = await ctx.db
      .query("userActiveOrganizations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existingActiveOrg) {
      await ctx.db.patch(existingActiveOrg._id, {
        organizationId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userActiveOrganizations", {
        userId,
        organizationId,
        updatedAt: now,
      });
    }

    // First admin skips crew onboarding.
    const existingOnboarding = await ctx.db
      .query("userOnboarding")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existingOnboarding) {
      await ctx.db.patch(existingOnboarding._id, {
        status: "waived",
        waivedAt: now,
        waivedByUserId: userId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userOnboarding", {
        userId,
        flow: "crew",
        status: "waived",
        waivedAt: now,
        waivedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      ok: true,
      email,
      role: "admin",
      organizationId,
      organizationName,
      organizationSlug: orgSlug,
      organizationType,
    };
  },
});

import { v } from "convex/values";
import { hashPassword } from "better-auth/crypto";
import { mutation } from "./_generated/server";
import { components } from "./_generated/api";

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

export const bootstrapAdmin = mutation({
  args: {
    secret: v.string(),
    email: v.string(),
    password: v.string(),
    name: v.string(),
    organizationName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!process.env.BOOTSTRAP_ADMIN_SECRET) {
      throw new Error("BOOTSTRAP_ADMIN_SECRET is not configured.");
    }
    if (args.secret !== process.env.BOOTSTRAP_ADMIN_SECRET) {
      throw new Error("Invalid bootstrap secret.");
    }

    const organizationName = args.organizationName ?? defaultOrganizationName;
    const now = Date.now();

    const existingUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: args.email }],
    });

    let userId = getId(existingUser);

    if (!existingUser) {
      const createdUser = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "user",
          data: {
            name: args.name,
            email: args.email,
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
          where: [{ field: "email", value: args.email }],
          update: { role: "admin", updatedAt: now, emailVerified: true },
        },
      });
    }

    if (!userId) {
      throw new Error("Unable to resolve user ID for bootstrap account.");
    }

    const existingCredentialAccount = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "account",
        where: [
          { field: "providerId", value: "credential" },
          { connector: "AND", field: "accountId", value: args.email },
        ],
      },
    );

    if (!existingCredentialAccount) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "account",
          data: {
            accountId: args.email,
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
      throw new Error("Unable to resolve organization ID for bootstrap account.");
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
        teams: [],
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

    return {
      ok: true,
      email: args.email,
      role: "admin",
      organizationId,
      organizationName,
      organizationSlug: orgSlug,
      organizationType,
    };
  },
});

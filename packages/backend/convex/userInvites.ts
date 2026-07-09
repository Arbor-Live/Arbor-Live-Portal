import { hashPassword } from "better-auth/crypto";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  getOrganizationName,
  markInvitationAccepted,
  resolveInviteByToken,
} from "./email/invitations";
import {
  legacyTeamsToMembership,
  userDisciplineValue,
  userVerticalValue,
  type UserDiscipline,
  type UserVertical,
} from "./lib/userVerticals";

type AuthUser = {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
  role?: string | null;
};

function getUserId(user: AuthUser) {
  return user.id ?? user._id ?? "";
}

async function ensureUserProfileDefaults(
  ctx: MutationCtx,
  userId: string,
  args: {
    verticals?: UserVertical[];
    disciplines?: UserDiscipline[];
    defaultOrganizationId?: string;
  },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      active: true,
      verticals: args.verticals ?? existing.verticals ?? [],
      disciplines: args.disciplines ?? existing.disciplines ?? [],
      defaultOrganizationId: args.defaultOrganizationId ?? existing.defaultOrganizationId,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("userAdminProfiles", {
    userId,
    active: true,
    verticals: args.verticals ?? [],
    disciplines: args.disciplines ?? [],
    defaultOrganizationId: args.defaultOrganizationId,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertOrgMembership(
  ctx: MutationCtx,
  args: { userId: string; organizationId: string; role: string },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_userId_and_organizationId", (q) =>
      q.eq("userId", args.userId).eq("organizationId", args.organizationId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      role: args.role,
      active: true,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("userOrganizationMemberships", {
    userId: args.userId,
    organizationId: args.organizationId,
    role: args.role,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
}

function pendingMembership(pending: {
  verticals?: string[];
  disciplines?: string[];
  teams?: string[];
}): { verticals: UserVertical[]; disciplines: UserDiscipline[] } {
  if (pending.verticals?.length) {
    return {
      verticals: pending.verticals as UserVertical[],
      disciplines: (pending.disciplines ?? []) as UserDiscipline[],
    };
  }
  return legacyTeamsToMembership(pending.teams ?? []);
}

export const getInviteByToken = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      email: v.string(),
      organizationName: v.string(),
      role: v.string(),
      hasAccount: v.boolean(),
      expired: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const resolved = await resolveInviteByToken(ctx, args.token.trim());
    if (!resolved) return null;

    if (resolved.expired) {
      return {
        email: resolved.pending.email,
        organizationName: await getOrganizationName(ctx, resolved.pending.organizationId),
        role: resolved.pending.role,
        hasAccount: false,
        expired: true,
      };
    }

    return {
      email: resolved.pending.email,
      organizationName: resolved.organizationName,
      role: resolved.pending.role,
      hasAccount: resolved.hasAccount,
      expired: false,
    };
  },
});

export const acceptInviteWithPassword = mutation({
  args: {
    token: v.string(),
    name: v.optional(v.string()),
    password: v.string(),
  },
  returns: v.object({
    email: v.string(),
  }),
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (args.password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const resolved = await resolveInviteByToken(ctx, token);
    if (!resolved) throw new Error("Invitation not found or already used.");
    if (resolved.expired) throw new Error("This invitation has expired.");
    if (resolved.hasAccount) {
      throw new Error("This email already has an account. Sign in instead.");
    }

    const { pending } = resolved;
    const email = pending.email.trim().toLowerCase();
    const now = Date.now();
    const displayName = args.name?.trim() || email;
    const membership = pendingMembership(pending);

    const created = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name: displayName,
          email,
          emailVerified: true,
          role: pending.role === "org_admin" ? "admin" : "member",
          createdAt: now,
          updatedAt: now,
        },
      },
    })) as AuthUser;
    const userId = getUserId(created);

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

    await ensureUserProfileDefaults(ctx, userId, {
      verticals: membership.verticals,
      disciplines: membership.disciplines,
      defaultOrganizationId: pending.organizationId,
    });
    await upsertOrgMembership(ctx, {
      userId,
      organizationId: pending.organizationId,
      role: pending.role,
    });
    await markInvitationAccepted(ctx, pending.invitationId);

    return { email };
  },
});

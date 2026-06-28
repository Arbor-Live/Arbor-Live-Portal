import { components } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  formatInviteExpiry,
  inviteAcceptUrl,
  signInUrl,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";

type InvitationRow = {
  id?: string;
  _id?: string;
  organizationId?: string;
  email?: string;
  role?: string | null;
  status?: string;
  expiresAt?: number;
  inviterId?: string;
};

type OrganizationRow = {
  id?: string;
  _id?: string;
  name?: string;
};

type AuthUserRecord = {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
};

function getRecordId(row: { id?: string; _id?: string } | null | undefined) {
  return row?.id ?? row?._id ?? "";
}

function createInviteToken() {
  return crypto.randomUUID();
}

export async function getOrganizationName(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const organization = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "organization",
    where: [{ field: "_id", value: organizationId }],
  })) as OrganizationRow | null;
  return organization?.name ?? "Arbor Live";
}

async function getInviterName(ctx: QueryCtx | MutationCtx, inviterId: string) {
  const inviter = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "_id", value: inviterId }],
  })) as AuthUserRecord | null;
  return inviter?.name ?? inviter?.email ?? "A team member";
}

async function userExistsWithEmail(ctx: QueryCtx | MutationCtx, email: string) {
  const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email }],
  })) as AuthUserRecord | null;
  return Boolean(user);
}

export async function upsertPendingInviteToken(
  ctx: MutationCtx,
  args: {
    invitationId: string;
    email: string;
    organizationId: string;
    role: string;
    teams?: string[];
    expiresAt: number;
  },
) {
  const existing = await ctx.db
    .query("pendingUserInvites")
    .withIndex("by_invitationId", (q) => q.eq("invitationId", args.invitationId))
    .unique();

  const token = createInviteToken();
  const now = Date.now();
  const row = {
    invitationId: args.invitationId,
    token,
    email: args.email,
    organizationId: args.organizationId,
    role: args.role,
    teams: args.teams,
    expiresAt: args.expiresAt,
    createdAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, row);
    return token;
  }

  await ctx.db.insert("pendingUserInvites", row);
  return token;
}

export async function scheduleUserInviteEmail(
  ctx: MutationCtx,
  args: {
    invitationId: string;
    email: string;
    organizationId: string;
    role: string;
    inviterId: string;
    expiresAt: number;
    teams?: string[];
    isExistingUser: boolean;
    resendKey?: string;
  },
) {
  const organizationName = await getOrganizationName(ctx, args.organizationId);
  const inviterName = await getInviterName(ctx, args.inviterId);
  const expiresAtLabel = formatInviteExpiry(args.expiresAt);

  let inviteUrl = signInUrl(args.email);
  if (!args.isExistingUser) {
    const token = await upsertPendingInviteToken(ctx, {
      invitationId: args.invitationId,
      email: args.email,
      organizationId: args.organizationId,
      role: args.role,
      teams: args.teams,
      expiresAt: args.expiresAt,
    });
    inviteUrl = inviteAcceptUrl(token);
  }

  const payload = {
    organizationName,
    inviterName,
    inviteUrl,
    recipientEmail: args.email,
    isExistingUser: args.isExistingUser,
    expiresAtLabel,
  };

  const idempotencyKey = `user_invite:${args.invitationId}:${args.resendKey ?? args.expiresAt}:${args.email}`;

  await enqueueEmail(ctx, {
    template: "user_invite",
    to: args.email,
    subject: subjectForTemplate("user_invite", organizationName),
    idempotencyKey,
    payload,
  });
}

export async function markInvitationAccepted(ctx: MutationCtx, invitationId: string) {
  await ctx.runMutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: "invitation",
      where: [{ field: "_id", value: invitationId }],
      update: {
        status: "accepted",
      },
    },
  });

  const pending = await ctx.db
    .query("pendingUserInvites")
    .withIndex("by_invitationId", (q) => q.eq("invitationId", invitationId))
    .unique();
  if (pending) {
    await ctx.db.delete(pending._id);
  }
}

export async function resolveInviteByToken(ctx: QueryCtx, token: string) {
  const pending = await ctx.db
    .query("pendingUserInvites")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!pending) return null;
  if (pending.expiresAt < Date.now()) return { expired: true as const, pending };

  const invitesResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "invitation",
    paginationOpts: { cursor: null, numItems: 2000 },
  });
  const invite = ((invitesResult?.page ?? []) as InvitationRow[]).find(
    (row) => getRecordId(row) === pending.invitationId,
  );
  if (!invite || invite.status !== "pending") return null;

  const organizationName = await getOrganizationName(ctx, pending.organizationId);
  const hasAccount = await userExistsWithEmail(ctx, pending.email);

  return {
    expired: false as const,
    pending,
    invite,
    organizationName,
    hasAccount,
  };
}

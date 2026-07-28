import { components } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { findAuthOrganizationById, findAuthUserById } from "../lib/auth";
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

function getRecordId(row: { id?: string; _id?: string } | null | undefined) {
  return row?.id ?? row?._id ?? "";
}

function createInviteToken() {
  return crypto.randomUUID();
}

export async function getOrganizationName(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const organization = await findAuthOrganizationById(ctx, organizationId);
  return organization?.name ?? "Arbor Live";
}

async function getInviterName(ctx: QueryCtx | MutationCtx, inviterId: string) {
  const inviter = await findAuthUserById(ctx, inviterId);
  return inviter?.name ?? inviter?.email ?? "A team member";
}

async function userExistsWithEmail(ctx: QueryCtx | MutationCtx, email: string) {
  const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: email }],
  })) as { id?: string; _id?: string; name?: string; email?: string } | null;
  return Boolean(user);
}

export async function upsertPendingInviteToken(
  ctx: MutationCtx,
  args: {
    invitationId: string;
    email: string;
    organizationId: string;
    role: string;
    bandRole?: string;
    teams?: string[];
    verticals?: string[];
    disciplines?: string[];
    rateMode?: "normal" | "lead" | "custom";
    customHourlyRateUsd?: number;
    payrollMethod?: "stanford" | "external";
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
    bandRole: args.bandRole,
    teams: args.teams,
    verticals: args.verticals,
    disciplines: args.disciplines,
    rateMode: args.rateMode,
    customHourlyRateUsd: args.customHourlyRateUsd,
    payrollMethod: args.payrollMethod,
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
    bandRole?: string;
    inviterId: string;
    expiresAt: number;
    teams?: string[];
    verticals?: string[];
    disciplines?: string[];
    rateMode?: "normal" | "lead" | "custom";
    customHourlyRateUsd?: number;
    payrollMethod?: "stanford" | "external";
    isExistingUser: boolean;
    resendKey?: string;
  },
) {
  const organizationName = await getOrganizationName(ctx, args.organizationId);
  const inviterName = await getInviterName(ctx, args.inviterId);
  const expiresAtLabel = formatInviteExpiry(args.expiresAt);

  const orgProfile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
    .unique();
  const onboardingPath =
    orgProfile?.organizationType === "band" || orgProfile?.organizationType === "dj"
      ? "/onboarding/band"
      : "/onboarding";

  let inviteUrl = signInUrl(args.email, onboardingPath);
  if (!args.isExistingUser) {
    const token = await upsertPendingInviteToken(ctx, {
      invitationId: args.invitationId,
      email: args.email,
      organizationId: args.organizationId,
      role: args.role,
      bandRole: args.bandRole,
      teams: args.teams,
      verticals: args.verticals,
      disciplines: args.disciplines,
      rateMode: args.rateMode,
      customHourlyRateUsd: args.customHourlyRateUsd,
      payrollMethod: args.payrollMethod,
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

export async function updatePendingInviteDetails(
  ctx: MutationCtx,
  invitationId: string,
  args: {
    role: string;
    teams?: string[];
    verticals?: string[];
    disciplines?: string[];
    rateMode?: "normal" | "lead" | "custom";
    customHourlyRateUsd?: number;
    payrollMethod?: "stanford" | "external";
  },
) {
  const pending = await ctx.db
    .query("pendingUserInvites")
    .withIndex("by_invitationId", (q) => q.eq("invitationId", invitationId))
    .unique();
  if (!pending) return;
  const patch: {
    role: string;
    teams?: string[];
    verticals?: string[];
    disciplines?: string[];
    rateMode?: "normal" | "lead" | "custom";
    customHourlyRateUsd?: number;
    payrollMethod?: "stanford" | "external";
  } = { role: args.role };
  if (args.teams !== undefined) patch.teams = args.teams;
  if (args.verticals !== undefined) patch.verticals = args.verticals;
  if (args.disciplines !== undefined) patch.disciplines = args.disciplines;
  if (args.rateMode !== undefined) patch.rateMode = args.rateMode;
  if (args.customHourlyRateUsd !== undefined) patch.customHourlyRateUsd = args.customHourlyRateUsd;
  if (args.payrollMethod !== undefined) patch.payrollMethod = args.payrollMethod;
  await ctx.db.patch(pending._id, patch);
}

export async function revokePendingInvite(ctx: MutationCtx, invitationId: string) {
  const pending = await ctx.db
    .query("pendingUserInvites")
    .withIndex("by_invitationId", (q) => q.eq("invitationId", invitationId))
    .unique();
  if (pending) {
    await ctx.db.delete(pending._id);
  }
}

export async function markInvitationCancelled(ctx: MutationCtx, invitationId: string) {
  await ctx.runMutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: "invitation",
      where: [{ field: "_id", value: invitationId }],
      update: {
        status: "cancelled",
      },
    },
  });
  await revokePendingInvite(ctx, invitationId);
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

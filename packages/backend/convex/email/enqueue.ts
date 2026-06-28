import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import type { EmailTemplate } from "./constants";

const emailTemplateValue = v.union(
  v.literal("event_cancelled"),
  v.literal("schedule_published"),
  v.literal("schedule_reminder"),
);

const emailStatusValue = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
);

export async function enqueueEmail(
  ctx: MutationCtx,
  args: {
    template: EmailTemplate;
    to: string;
    subject: string;
    eventId?: Id<"events">;
    idempotencyKey: string;
    payload: unknown;
  },
) {
  const existing = await ctx.db
    .query("emailNotifications")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .unique();
  if (existing) return existing._id;

  const notificationId = await ctx.db.insert("emailNotifications", {
    template: args.template,
    status: "queued",
    to: args.to,
    subject: args.subject,
    eventId: args.eventId,
    idempotencyKey: args.idempotencyKey,
    payload: args.payload,
    createdAt: Date.now(),
  });

  await ctx.scheduler.runAfter(0, internal.email.send.sendQueuedEmail, {
    notificationId,
  });

  return notificationId;
}

export const getNotification = internalQuery({
  args: { notificationId: v.id("emailNotifications") },
  returns: v.union(
    v.object({
      _id: v.id("emailNotifications"),
      template: emailTemplateValue,
      status: emailStatusValue,
      to: v.string(),
      subject: v.string(),
      payload: v.any(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.notificationId);
    if (!row) return null;
    return {
      _id: row._id,
      template: row.template,
      status: row.status,
      to: row.to,
      subject: row.subject,
      payload: row.payload,
    };
  },
});

export const markSent = internalMutation({
  args: {
    notificationId: v.id("emailNotifications"),
    resendId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, {
      status: "sent",
      resendId: args.resendId,
      sentAt: Date.now(),
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    notificationId: v.id("emailNotifications"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, {
      status: "failed",
      error: args.error,
    });
    return null;
  },
});

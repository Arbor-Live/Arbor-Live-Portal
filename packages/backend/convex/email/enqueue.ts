import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import type { EmailTemplate } from "./constants";

/** Coalesce rapid schedule/crew edits into one email per recipient. */
export const EMAIL_DEBOUNCE_MS = 45_000;

const emailTemplateValue = v.union(
  v.literal("event_cancelled"),
  v.literal("schedule_published"),
  v.literal("crew_scheduled"),
  v.literal("crew_unscheduled"),
  v.literal("schedule_reminder"),
  v.literal("user_invite"),
  v.literal("password_reset"),
  v.literal("email_verification"),
  v.literal("change_email_confirmation"),
  v.literal("booking_request_received"),
  v.literal("booking_request_admin"),
  v.literal("booking_quote_ready"),
  v.literal("payment_proof_reminder"),
  v.literal("payment_proof_submitted"),
  v.literal("paying_party_added"),
  v.literal("quote_changes_requested"),
  v.literal("band_assigned"),
  v.literal("band_event_onboarding_invite"),
  v.literal("band_payment_confirmation"),
  v.literal("band_payment_completed"),
  v.literal("band_payment_payee_required"),
  v.literal("onboarding_completed"),
  v.literal("onboarding_reminder"),
  v.literal("band_application_received"),
  v.literal("band_application_approved"),
  v.literal("band_application_declined"),
  v.literal("band_application_confirmation"),
  v.literal("crew_application_received"),
  v.literal("crew_application_closed"),
  v.literal("crew_application_confirmation"),
  v.literal("crew_trainee_intro"),
  v.literal("rental_outbound_packed"),
  v.literal("rental_return_processed"),
  v.literal("post_event_album"),
  v.literal("event_comment_mention"),
  v.literal("comment_mention"),
);

const emailStatusValue = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
);

type EnqueueEmailArgs = {
  template: EmailTemplate;
  to: string;
  cc?: string[];
  replyTo?: string[];
  subject: string;
  eventId?: Id<"events">;
  idempotencyKey: string;
  payload: unknown;
};

export async function enqueueEmail(ctx: MutationCtx, args: EnqueueEmailArgs) {
  const existing = await ctx.db
    .query("emailNotifications")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .unique();
  if (existing) {
    if (existing.status === "failed") {
      await ctx.db.patch(existing._id, {
        status: "queued",
        error: undefined,
        to: args.to,
        cc: args.cc?.length ? args.cc : undefined,
        replyTo: args.replyTo?.length ? args.replyTo : undefined,
        subject: args.subject,
        payload: args.payload,
        readyAt: undefined,
        sendGeneration: undefined,
        debounceKey: undefined,
      });
      await ctx.scheduler.runAfter(0, internal.email.send.sendQueuedEmail, {
        notificationId: existing._id,
      });
    }
    return existing._id;
  }

  const notificationId = await ctx.db.insert("emailNotifications", {
    template: args.template,
    status: "queued",
    to: args.to,
    cc: args.cc?.length ? args.cc : undefined,
    replyTo: args.replyTo?.length ? args.replyTo : undefined,
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

/**
 * Queue an email that waits `debounceMs` before sending. Later updates with the
 * same `debounceKey` refresh the payload and reset the timer so burst edits
 * (schedule/crew saves) produce one email instead of many.
 */
export async function enqueueDebouncedEmail(
  ctx: MutationCtx,
  args: EnqueueEmailArgs & {
    debounceKey: string;
    debounceMs?: number;
  },
) {
  const debounceMs = args.debounceMs ?? EMAIL_DEBOUNCE_MS;
  const now = Date.now();
  const readyAt = now + debounceMs;

  const exactMatch = await ctx.db
    .query("emailNotifications")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .unique();
  if (exactMatch && exactMatch.status !== "failed") {
    return exactMatch._id;
  }

  const pending = await ctx.db
    .query("emailNotifications")
    .withIndex("by_debounceKey_and_status", (q) =>
      q.eq("debounceKey", args.debounceKey).eq("status", "queued"),
    )
    .take(1);
  const existingPending = pending[0];

  if (existingPending) {
    if (existingPending.idempotencyKey !== args.idempotencyKey) {
      const colliding = await ctx.db
        .query("emailNotifications")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
        .unique();
      if (colliding && colliding.status !== "failed" && colliding._id !== existingPending._id) {
        // Latest content was already delivered under this idempotency key.
        await ctx.db.delete(existingPending._id);
        return colliding._id;
      }
    }

    const nextGeneration = (existingPending.sendGeneration ?? 0) + 1;
    await ctx.db.patch(existingPending._id, {
      to: args.to,
      cc: args.cc?.length ? args.cc : undefined,
      replyTo: args.replyTo?.length ? args.replyTo : undefined,
      subject: args.subject,
      eventId: args.eventId,
      idempotencyKey: args.idempotencyKey,
      payload: args.payload,
      error: undefined,
      readyAt,
      sendGeneration: nextGeneration,
    });
    await ctx.scheduler.runAfter(debounceMs, internal.email.enqueue.flushDebouncedEmail, {
      notificationId: existingPending._id,
      sendGeneration: nextGeneration,
    });
    return existingPending._id;
  }

  const notificationId = await ctx.db.insert("emailNotifications", {
    template: args.template,
    status: "queued",
    to: args.to,
    cc: args.cc?.length ? args.cc : undefined,
    replyTo: args.replyTo?.length ? args.replyTo : undefined,
    subject: args.subject,
    eventId: args.eventId,
    idempotencyKey: args.idempotencyKey,
    debounceKey: args.debounceKey,
    sendGeneration: 1,
    readyAt,
    payload: args.payload,
    createdAt: now,
  });

  await ctx.scheduler.runAfter(debounceMs, internal.email.enqueue.flushDebouncedEmail, {
    notificationId,
    sendGeneration: 1,
  });

  return notificationId;
}

/** Drop a queued debounced email so a later flush no-ops (generation mismatch / missing row). */
export async function cancelPendingDebouncedEmail(ctx: MutationCtx, debounceKey: string) {
  const pending = await ctx.db
    .query("emailNotifications")
    .withIndex("by_debounceKey_and_status", (q) =>
      q.eq("debounceKey", debounceKey).eq("status", "queued"),
    )
    .take(5);
  for (const row of pending) {
    await ctx.db.delete(row._id);
  }
}

/** True if a prior send for this debounce key already reached the recipient. */
export async function hasSentDebouncedEmail(ctx: MutationCtx, debounceKey: string) {
  const sent = await ctx.db
    .query("emailNotifications")
    .withIndex("by_debounceKey_and_status", (q) =>
      q.eq("debounceKey", debounceKey).eq("status", "sent"),
    )
    .take(1);
  return sent.length > 0;
}

export const flushDebouncedEmail = internalMutation({
  args: {
    notificationId: v.id("emailNotifications"),
    sendGeneration: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.notificationId);
    if (!row || row.status !== "queued") return null;
    if ((row.sendGeneration ?? 0) !== args.sendGeneration) return null;

    const readyAt = row.readyAt ?? 0;
    const remaining = readyAt - Date.now();
    if (remaining > 0) {
      await ctx.scheduler.runAfter(remaining, internal.email.enqueue.flushDebouncedEmail, {
        notificationId: args.notificationId,
        sendGeneration: args.sendGeneration,
      });
      return null;
    }

    await ctx.scheduler.runAfter(0, internal.email.send.sendQueuedEmail, {
      notificationId: args.notificationId,
    });
    return null;
  },
});

export const getNotification = internalQuery({
  args: { notificationId: v.id("emailNotifications") },
  returns: v.union(
    v.object({
      _id: v.id("emailNotifications"),
      template: emailTemplateValue,
      status: emailStatusValue,
      to: v.string(),
      cc: v.optional(v.array(v.string())),
      replyTo: v.optional(v.array(v.string())),
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
      cc: row.cc,
      replyTo: row.replyTo,
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

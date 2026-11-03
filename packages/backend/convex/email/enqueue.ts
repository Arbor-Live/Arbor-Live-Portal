import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { findAuthUserByEmail, getUserId } from "../lib/auth";
import {
  isConfigurableEmailTemplate,
  isTemplateEnabledForChannel,
} from "../lib/emailPreferences";
import { type BookingEmailSource, resolveBookingEmail } from "../lib/bookingEmail";
import type { EmailTemplate } from "./constants";
import { emailTemplateValue } from "../lib/emailTemplateValue";
import {
  cancelPendingInAppNotifications,
  isInAppNotificationTemplate,
  recordInAppNotification,
} from "../lib/inAppNotifications";

/** Coalesce rapid schedule/crew edits into one email per recipient. */
export const EMAIL_DEBOUNCE_MS = 45_000;

const emailStatusValue = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
);

type EnqueueEmailBase = {
  template: EmailTemplate;
  to: string;
  cc?: string[];
  eventId?: Id<"events">;
  idempotencyKey: string;
  payload: unknown;
  /**
   * Explicit recipient when `to` is not their account email (e.g. a calendar
   * invite override), so their notification preferences still apply.
   */
  recipientUserId?: string;
  /** Bell title when it should differ from the email subject; defaults to the subject. */
  inAppTitle?: string;
};

type EnqueueEmailArgs = EnqueueEmailBase &
  (
    | { subject: string; replyTo?: string[]; booking?: undefined }
    | {
        /**
         * A client booking email: sent from the booking sender on the booking's
         * thread, with its Reply-To and subject (`lib/bookingEmail.ts`).
         */
        booking: BookingEmailSource;
        subject?: undefined;
        replyTo?: undefined;
      }
  );

/**
 * The recipient's account id: explicit `recipientUserId`, else looked up by
 * email. Unknown addresses (external clients, shared inboxes) resolve to null.
 */
async function resolveRecipientUserId(
  ctx: MutationCtx,
  args: EnqueueEmailBase,
): Promise<string | null> {
  const explicit = args.recipientUserId?.trim();
  if (explicit) return explicit;
  const user = await findAuthUserByEmail(ctx, args.to);
  return user ? getUserId(user) || null : null;
}

/**
 * Resolve the recipient, mirror the email into their notification center
 * unless they muted it there, and return whether the email itself should send.
 * Each channel has its own opt-out; unknown addresses are never suppressed.
 */
async function prepareRecipient(
  ctx: MutationCtx,
  args: EnqueueEmailBase & { subject?: string },
  debounce?: { key: string; delayMs: number },
): Promise<boolean> {
  const configurable = isConfigurableEmailTemplate(args.template);
  const inApp = isInAppNotificationTemplate(args.template);
  if (!configurable && !inApp) return true;
  const userId = await resolveRecipientUserId(ctx, args);
  if (!userId) return true;
  const profile = configurable
    ? await ctx.db
        .query("userAdminProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique()
    : null;
  if (inApp && isTemplateEnabledForChannel(profile, args.template, "inApp")) {
    const title = args.inAppTitle ?? args.subject;
    if (!title) {
      throw new Error(`${args.template} mirrors into the bell but has no inAppTitle or subject`);
    }
    await recordInAppNotification(ctx, {
      userId,
      template: args.template,
      subject: title,
      payload: args.payload,
      eventId: args.eventId,
      idempotencyKey: args.idempotencyKey,
      debounce,
    });
  }
  return isTemplateEnabledForChannel(profile, args.template, "email");
}

export async function enqueueEmail(ctx: MutationCtx, args: EnqueueEmailArgs) {
  if (!(await prepareRecipient(ctx, args))) return null;
  const existing = await ctx.db
    .query("emailNotifications")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .unique();
  if (existing && existing.status !== "failed") return existing._id;

  // Resolved only for an email that is actually queued, so a no-op replay never claims the thread's subject.
  const envelope = args.booking
    ? await resolveBookingEmail(ctx, args.booking)
    : { booking: undefined, replyTo: args.replyTo, subject: args.subject };

  if (existing) {
    await ctx.db.patch(existing._id, {
      status: "queued",
      error: undefined,
      to: args.to,
      cc: args.cc?.length ? args.cc : undefined,
      replyTo: envelope.replyTo?.length ? envelope.replyTo : undefined,
      // A retried booking email keeps the subject it was first queued with.
      subject: existing.booking && envelope.booking ? existing.subject : envelope.subject,
      booking: envelope.booking,
      payload: args.payload,
      readyAt: undefined,
      sendGeneration: undefined,
      debounceKey: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.email.send.sendQueuedEmail, {
      notificationId: existing._id,
    });
    return existing._id;
  }

  const notificationId = await ctx.db.insert("emailNotifications", {
    template: args.template,
    status: "queued",
    to: args.to,
    cc: args.cc?.length ? args.cc : undefined,
    replyTo: envelope.replyTo?.length ? envelope.replyTo : undefined,
    subject: envelope.subject,
    booking: envelope.booking,
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
  args: EnqueueEmailBase & {
    subject: string;
    replyTo?: string[];
    debounceKey: string;
    debounceMs?: number;
  },
) {
  const debounceMs = args.debounceMs ?? EMAIL_DEBOUNCE_MS;

  // A replay of content already queued or sent is a no-op. Check before
  // touching the notification center, or replaying an older key after a newer
  // update was delivered would resurface the stale content there.
  const exactMatch = await ctx.db
    .query("emailNotifications")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .unique();
  if (exactMatch && exactMatch.status !== "failed") {
    return exactMatch._id;
  }

  const shouldSend = await prepareRecipient(ctx, args, {
    key: args.debounceKey,
    delayMs: debounceMs,
  });
  if (!shouldSend) return null;

  const now = Date.now();
  const readyAt = now + debounceMs;

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
  await cancelPendingInAppNotifications(ctx, debounceKey);
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
      booking: v.optional(v.object({ threadId: v.id("emailThreads"), from: v.string() })),
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
      booking: row.booking,
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

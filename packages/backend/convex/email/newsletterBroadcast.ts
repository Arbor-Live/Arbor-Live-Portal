"use node";

import { Resend as ResendSdk } from "resend";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { renderEmailHtml } from "./templates";
import { SITE_URL, subjectForTemplate } from "./constants";

/**
 * The newsletter is the one Arbor send that goes through Resend **Broadcasts**
 * rather than the transactional `emailNotifications` queue. That buys us
 * Resend-managed unsubscribe links, open/click metrics, and the Broadcasts
 * dashboard — what a weekly send actually needs. Transactional mail is
 * untouched.
 *
 * Convex stays the source of truth for the subscriber list; confirmed rows are
 * mirrored into a Resend segment, which the broadcast targets. Query/mutation
 * helpers live in `newsletterBroadcastData.ts` (default runtime) because this
 * module is `"use node"` and may only export actions.
 */

const NEWSLETTER_FROM =
  process.env.NEWSLETTER_FROM ?? "Arbor Live <newsletter@arbor.st>";

function segmentId() {
  const id = process.env.RESEND_NEWSLETTER_SEGMENT_ID?.trim();
  return id || null;
}

function getResendSdk() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured — cannot send the newsletter.");
  }
  return new ResendSdk(apiKey);
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown newsletter error";
}

/** Deterministic broadcast name for a send window, used for reconciliation. */
function broadcastNameFor(windowKey: string) {
  return `This Week at Arbor — ${windowKey}`;
}

/**
 * Resend has no idempotency key for broadcasts, so an attempt whose response was
 * lost is reconciled by its deterministic name before we retry. Only a send
 * created at/after the attempt we are reconciling counts — the same date label
 * recurs yearly, so name alone is not enough.
 */
async function findBroadcastByName(name: string, sinceMs: number) {
  const listed = await getResendSdk().broadcasts.list({ limit: 100 });
  if (listed.error) throw new Error(`[Resend] ${listed.error.message}`);
  return (
    listed.data?.data.find(
      (broadcast) =>
        broadcast.name === name &&
        new Date(broadcast.created_at).getTime() >= sinceMs - 5 * 60 * 1000,
    ) ?? null
  );
}

export type BroadcastRunResult = {
  sent: boolean;
  skippedReason?: string;
  eventCount: number;
  broadcastId?: string;
};

/** Local e2e only: render + skip the network call so tests spend no quota. */
function isE2eEmailMockEnabled() {
  if (process.env.E2E_EMAIL_MOCK !== "true") return false;
  if (process.env.E2E_HELPERS !== "true") return false;
  const siteUrl = process.env.SITE_URL ?? "";
  return siteUrl.includes("localhost") || siteUrl.includes("127.0.0.1");
}

/**
 * Monday entrypoint. Builds the week's public events, skips the send entirely
 * when nothing is on (an empty "this week" email is worse than silence), then
 * creates + sends the Resend broadcast to the subscriber segment.
 */
export const run = internalAction({
  args: { previewOnly: v.optional(v.boolean()) },
  returns: v.object({
    sent: v.boolean(),
    skippedReason: v.optional(v.string()),
    eventCount: v.number(),
    broadcastId: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<BroadcastRunResult> => {
    const week = await ctx.runQuery(
      internal.email.newsletterBroadcastData.buildWeek,
      { now: Date.now() },
    );

    if (week.events.length === 0) {
      return {
        sent: false,
        skippedReason: "No public events in the next 7 days.",
        eventCount: 0,
      };
    }

    // Render first: a template error should fail before anything is scheduled
    // or sent, and rendering is how preview mode earns its keep.
    const html = await renderEmailHtml("this_week_at_arbor", {
      weekLabel: week.weekLabel,
      events: week.events,
      allEventsUrl: `${SITE_URL}/events`,
      // Resend replaces this placeholder with a per-recipient unsubscribe link.
      unsubscribeUrl: "{{{RESEND_UNSUBSCRIBE_URL}}}",
    });

    if (args.previewOnly) {
      return {
        sent: false,
        skippedReason: "Preview only.",
        eventCount: week.events.length,
      };
    }

    if (isE2eEmailMockEnabled()) {
      return { sent: false, skippedReason: "E2E mock.", eventCount: week.events.length };
    }

    const id = segmentId();
    if (!id) {
      throw new Error(
        "RESEND_NEWSLETTER_SEGMENT_ID is not set. Create a segment in Resend and " +
          "set this deployment env var before the weekly job can send.",
      );
    }

    // One broadcast per window: claim before the network call so a duplicate
    // click, a second admin, or the cron racing an admin cannot send twice.
    const windowKey = week.weekLabel;
    const name = broadcastNameFor(windowKey);

    const claim = await ctx.runMutation(
      internal.email.newsletterBroadcastData.claimBroadcast,
      { windowKey },
    );
    let claimed = claim.claimed;
    let claimReason = claim.reason;
    let claimToken = claim.claimToken;

    if (
      !claimed &&
      claim.needsReconcile &&
      claim.startedAtMs !== undefined
    ) {
      // A previous attempt may have reached Resend without recording its id.
      // Check the provider before allowing a retry, or we could send twice.
      const staleToken = claim.startedAtMs;
      const existing = await findBroadcastByName(name, staleToken);
      if (existing) {
        await ctx.runMutation(
          internal.email.newsletterBroadcastData.markBroadcastSent,
          { windowKey, claimToken: staleToken, broadcastId: existing.id },
        );
        return {
          sent: false,
          skippedReason: `Already sent for ${windowKey}.`,
          eventCount: week.events.length,
          broadcastId: existing.id,
        };
      }
      const reclaimed = await ctx.runMutation(
        internal.email.newsletterBroadcastData.reclaimStaleBroadcast,
        { windowKey },
      );
      claimed = reclaimed.claimed;
      claimToken = reclaimed.claimToken;
      claimReason = undefined;
    }

    if (!claimed) {
      return {
        sent: false,
        skippedReason: claimReason ?? "Newsletter already queued.",
        eventCount: week.events.length,
      };
    }
    if (claimToken === undefined) {
      throw new Error("Newsletter claim is missing its ownership token.");
    }

    const result = await getResendSdk().broadcasts.create({
      name,
      segmentId: id,
      from: NEWSLETTER_FROM,
      subject: subjectForTemplate("this_week_at_arbor", windowKey),
      html,
      send: true,
    });

    if (result.error) {
      // A provider rejection means nothing was accepted: free the window.
      await ctx.runMutation(
        internal.email.newsletterBroadcastData.releaseBroadcast,
        { windowKey, claimToken },
      );
      throw new Error(
        `[Resend] ${result.error.name ?? "broadcast_failed"}: ${result.error.message}`,
      );
    }
    if (!result.data?.id) {
      // Ambiguous — keep the claim so a retry cannot duplicate; the next run
      // reconciles by name.
      throw new Error("Resend did not return a broadcast id.");
    }

    await ctx.runMutation(
      internal.email.newsletterBroadcastData.markBroadcastSent,
      { windowKey, claimToken, broadcastId: result.data.id },
    );

    return { sent: true, eventCount: week.events.length, broadcastId: result.data.id };
  },
});

/**
 * Create or update the Resend contact for a confirmed subscriber and add it to
 * the newsletter segment. Idempotent — safe to re-run. Failures are recorded on
 * the row so the admin list surfaces them instead of dropping people silently.
 */
export const syncContact = internalAction({
  args: { subscriberId: v.id("newsletterSubscribers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const subscriber = await ctx.runQuery(
      internal.email.newsletterBroadcastData.getSubscriber,
      { subscriberId: args.subscriberId },
    );
    if (!subscriber || subscriber.status !== "subscribed") return null;

    const id = segmentId();
    if (!id) {
      await ctx.runMutation(
        internal.email.newsletterBroadcastData.recordSyncError,
        {
          subscriberId: args.subscriberId,
          expectedUpdatedAt: subscriber.updatedAt,
          error: "RESEND_NEWSLETTER_SEGMENT_ID is not configured on this deployment.",
        },
      );
      return null;
    }

    if (isE2eEmailMockEnabled()) return null;

    try {
      const [firstName, ...rest] = (subscriber.name ?? "").trim().split(/\s+/);
      const created = await getResendSdk().contacts.create({
        email: subscriber.email,
        firstName: firstName || undefined,
        lastName: rest.join(" ") || undefined,
        unsubscribed: false,
        segments: [{ id }],
      });

      if (created.error || !created.data?.id) {
        throw new Error(
          created.error?.message ?? "Resend did not return a contact id.",
        );
      }

      await ctx.runMutation(internal.email.newsletterBroadcastData.recordSynced, {
        subscriberId: args.subscriberId,
        expectedUpdatedAt: subscriber.updatedAt,
        resendContactId: created.data.id,
      });

      // `contacts.create` can outlive an unsubscribe whose removal already ran
      // (and found no contact yet). If the row is now unsubscribed, take the
      // contact we just added back out of the segment.
      const after = await ctx.runQuery(
        internal.email.newsletterBroadcastData.getSubscriber,
        { subscriberId: args.subscriberId },
      );
      if (after?.status === "unsubscribed") {
        await ctx.scheduler.runAfter(
          0,
          internal.email.newsletterBroadcast.removeContactFromSegment,
          { subscriberId: args.subscriberId, expectedUpdatedAt: after.updatedAt },
        );
      }
    } catch (error) {
      await ctx.runMutation(
        internal.email.newsletterBroadcastData.recordSyncError,
        {
          subscriberId: args.subscriberId,
          expectedUpdatedAt: subscriber.updatedAt,
          error: formatError(error),
        },
      );
    }

    return null;
  },
});

/**
 * Remove a contact from the segment when someone unsubscribes.
 *
 * Scheduled from `unsubscribeByToken`, so it can run after the person has
 * already re-subscribed. Guard on the row still being unsubscribed *and* on the
 * generation we scheduled against, otherwise a stale job would pull a
 * re-subscribed contact back out of the segment.
 */
export const removeContactFromSegment = internalAction({
  args: {
    subscriberId: v.id("newsletterSubscribers"),
    /** Row `updatedAt` at schedule time; rejects stale removal jobs. */
    expectedUpdatedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const subscriber = await ctx.runQuery(
      internal.email.newsletterBroadcastData.getSubscriber,
      { subscriberId: args.subscriberId },
    );
    if (!subscriber) return null;
    if (subscriber.status !== "unsubscribed") return null;
    if (
      args.expectedUpdatedAt !== undefined &&
      subscriber.updatedAt !== args.expectedUpdatedAt
    ) {
      return null;
    }

    const id = segmentId();
    if (!id || isE2eEmailMockEnabled()) return null;

    try {
      const result = await getResendSdk().contacts.segments.remove({
        // The installed SDK names this `contactId`; `email` is the fallback when
        // the contact never got mirrored.
        segmentId: id,
        ...(subscriber.resendContactId
          ? { contactId: subscriber.resendContactId }
          : { email: subscriber.email }),
      });
      if (result.error) throw new Error(result.error.message);
    } catch (error) {
      // Only record while the row is still the unsubscribe we acted on.
      await ctx.runMutation(
        internal.email.newsletterBroadcastData.recordUnsubscribeErrorIfCurrent,
        {
          subscriberId: args.subscriberId,
          expectedUpdatedAt: args.expectedUpdatedAt,
          error: `unsubscribe sync: ${formatError(error)}`,
        },
      );
    }

    // The removal awaited a network call, so the person may have re-subscribed
    // while it ran. If so, re-mirror them — their own sync may have completed
    // before this removal pulled them back out.
    const after = await ctx.runQuery(
      internal.email.newsletterBroadcastData.getSubscriber,
      { subscriberId: args.subscriberId },
    );
    if (after?.status === "subscribed") {
      await ctx.scheduler.runAfter(
        0,
        internal.email.newsletterBroadcast.syncContact,
        { subscriberId: args.subscriberId },
      );
    }

    return null;
  },
});

/** Admin-triggered "send it now". Gated by the public `newsletter.sendNow`
 *  mutation, which requires an admin session before scheduling this. */
export const sendNow = internalAction({
  args: {},
  returns: v.object({
    sent: v.boolean(),
    skippedReason: v.optional(v.string()),
    eventCount: v.number(),
    broadcastId: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<BroadcastRunResult> => {
    return await ctx.runAction(internal.email.newsletterBroadcast.run, {});
  },
});

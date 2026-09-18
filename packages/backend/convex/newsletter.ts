import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./lib/auth";
import { enforceRateLimit, HOUR_MS } from "./rateLimit";
import { EMAIL_FROM, SITE_URL } from "./email/constants";

export const NEWSLETTER_SOURCES = [
  "landing",
  "open_mic",
  "events_page",
  "admin",
] as const;

export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];

const sourceValue = v.union(
  v.literal("landing"),
  v.literal("open_mic"),
  v.literal("events_page"),
  v.literal("admin"),
);

const subscriberStatusValue = v.union(
  v.literal("subscribed"),
  v.literal("unsubscribed"),
);

/** Basic address shape check. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function newToken(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

export function unsubscribeUrl(token: string): string {
  return `${SITE_URL}/newsletter?token=${encodeURIComponent(token)}`;
}

/**
 * Subscribe an address. Single opt-in: no confirmation email is sent because
 * transactional email is rationed, and the weekly Broadcast carries its own
 * Resend-managed unsubscribe link. Confirmed rows are mirrored into the Resend
 * segment before the next send.
 */
async function subscribeEmail(
  ctx: MutationCtx,
  args: { email: string; name?: string; source: NewsletterSource },
) {
  const email = normalizeEmail(args.email);
  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("newsletterSubscribers")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

  const name = args.name?.trim() || undefined;

  if (existing) {
    if (existing.status === "subscribed") {
      // Already on the list — nothing to do, treat as success.
      return { alreadySubscribed: true as const };
    }
    await ctx.db.patch(existing._id, {
      status: "subscribed",
      name: name ?? existing.name,
      source: args.source,
      confirmedAt: now,
      unsubscribedAt: undefined,
      syncError: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.email.newsletterBroadcast.syncContact,
      { subscriberId: existing._id },
    );
    return { alreadySubscribed: false as const };
  }

  const subscriberId = await ctx.db.insert("newsletterSubscribers", {
    email,
    name,
    status: "subscribed",
    source: args.source,
    unsubscribeToken: newToken("nlunsub"),
    confirmedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.email.newsletterBroadcast.syncContact, {
    subscriberId,
  });

  return { alreadySubscribed: false as const };
}

/* ------------------------------------------------------------------ */
/* Public                                                             */
/* ------------------------------------------------------------------ */

export const subscribePublic = mutation({
  args: {
    /** Honeypot: bots fill this, humans never see it. */
    website: v.optional(v.string()),
    email: v.string(),
    name: v.optional(v.string()),
    source: v.optional(sourceValue),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    if (args.website?.trim()) {
      // Silently accept so bots do not learn the honeypot exists.
      return { ok: true };
    }
    const email = normalizeEmail(args.email);
    await enforceRateLimit(ctx, `newsletterSubscribe:${email}`, {
      limit: 5,
      windowMs: HOUR_MS,
    });
    await enforceRateLimit(ctx, "newsletterSubscribe:global", {
      limit: 120,
      windowMs: HOUR_MS,
    });
    await subscribeEmail(ctx, {
      email,
      name: args.name,
      source: args.source ?? "landing",
    });
    return { ok: true };
  },
});

/** Token-gated read for the public preferences page. */
export const getByToken = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      email: v.string(),
      name: v.optional(v.string()),
      status: subscriberStatusValue,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await findByUnsubscribeToken(ctx, args.token);
    if (!row) return null;
    return { email: row.email, name: row.name, status: row.status };
  },
});

/** Public one-click unsubscribe (from the email footer or prefs page). */
export const unsubscribeByToken = mutation({
  args: { token: v.string() },
  returns: v.union(
    v.object({ status: v.literal("unsubscribed"), email: v.string() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await findByUnsubscribeToken(ctx, args.token);
    if (!row) return null;

    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "unsubscribed",
      unsubscribedAt: now,
      updatedAt: now,
    });

    if (row.resendContactId || row.status === "subscribed") {
      await ctx.scheduler.runAfter(
        0,
        internal.email.newsletterBroadcast.removeContactFromSegment,
        { subscriberId: row._id },
      );
    }

    return { status: "unsubscribed" as const, email: row.email };
  },
});

async function findByUnsubscribeToken(
  ctx: QueryCtx | MutationCtx,
  token: string,
) {
  return await ctx.db
    .query("newsletterSubscribers")
    .withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", token))
    .unique();
}

/* ------------------------------------------------------------------ */
/* Admin                                                              */
/* ------------------------------------------------------------------ */

const adminSubscriberValue = v.object({
  subscriberId: v.id("newsletterSubscribers"),
  email: v.string(),
  name: v.optional(v.string()),
  status: subscriberStatusValue,
  source: v.string(),
  confirmedAt: v.optional(v.number()),
  unsubscribedAt: v.optional(v.number()),
  syncError: v.optional(v.string()),
  createdAt: v.number(),
});

export const listSubscribers = query({
  args: {
    status: v.optional(subscriberStatusValue),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    subscribers: v.array(adminSubscriberValue),
    counts: v.object({
      subscribed: v.number(),
      unsubscribed: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const counts = { subscribed: 0, unsubscribed: 0 };
    for (const status of ["subscribed", "unsubscribed"] as const) {
      // Bounded sample is enough to render the badges; the subscriber list is
      // small (campus mailing list) so a full count scan is not a concern yet.
      const rows = await ctx.db
        .query("newsletterSubscribers")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(1000);
      counts[status] = rows.length;
    }

    const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);
    const rows = args.status
      ? await ctx.db
          .query("newsletterSubscribers")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(limit)
      : await ctx.db.query("newsletterSubscribers").order("desc").take(limit);

    return {
      subscribers: rows.map((row) => ({
        subscriberId: row._id,
        email: row.email,
        name: row.name,
        status: row.status,
        source: row.source,
        confirmedAt: row.confirmedAt,
        unsubscribedAt: row.unsubscribedAt,
        syncError: row.syncError,
        createdAt: row.createdAt,
      })),
      counts,
    };
  },
});

/** Admin: add someone directly (e.g. a staff member who asked verbally). */
export const addSubscriber = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await subscribeEmail(ctx, {
      email: args.email,
      name: args.name,
      source: "admin",
    });
    return { ok: true };
  },
});

/** Admin: retry a failed Resend segment mirror. */
export const retrySync = mutation({
  args: { subscriberId: v.id("newsletterSubscribers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get(args.subscriberId);
    if (!row) throw new Error("Subscriber not found.");
    if (row.status !== "subscribed") {
      throw new Error("Only subscribed addresses can be synced to Resend.");
    }
    await ctx.db.patch(row._id, { syncError: undefined, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.email.newsletterBroadcast.syncContact, {
      subscriberId: row._id,
    });
    return null;
  },
});

/** Admin diagnostic: the from-address and segment the weekly send will use. */
export const getBroadcastConfig = query({
  args: {},
  returns: v.object({
    from: v.string(),
    segmentConfigured: v.boolean(),
    testMode: v.boolean(),
    siteUrl: v.string(),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return {
      from: EMAIL_FROM,
      segmentConfigured: Boolean(process.env.RESEND_NEWSLETTER_SEGMENT_ID),
      testMode: process.env.EMAIL_TEST_MODE === "true",
      siteUrl: SITE_URL,
    };
  },
});

/**
 * Admin: send the newsletter immediately instead of waiting for Monday.
 * Gated here (admins only) and then handed to an action, since the send talks
 * to Resend over the network.
 */
export const sendNow = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.email.newsletterBroadcast.sendNow, {});
    return null;
  },
});

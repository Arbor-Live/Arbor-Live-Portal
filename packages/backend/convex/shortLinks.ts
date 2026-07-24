import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getUserId, requireVerticalOrAdmin } from "./lib/auth";
import { assertUniqueShortLinkSlug, normalizeShortLinkSlug } from "./lib/shortLinkSlug";
import {
  isShortLinkExpired,
  resolveShortLinkExpiresAt,
  shortLinkStatus,
  validateShortLinkDestinationUrl,
} from "./lib/shortLinks";

/** Bound per-link click reads so list/detail stay within transaction limits. */
const MAX_CLICKS_PER_LINK = 10_000;
const CLICK_DELETE_BATCH = 200;

const expiryModeValue = v.union(
  v.literal("none"),
  v.literal("manual"),
  v.literal("event_plus_30_days"),
);

const listRowValue = v.object({
  _id: v.id("shortLinks"),
  slug: v.string(),
  destinationUrl: v.string(),
  label: v.string(),
  enabled: v.boolean(),
  eventId: v.union(v.id("events"), v.null()),
  eventTitle: v.union(v.string(), v.null()),
  expiryMode: expiryModeValue,
  expiresAt: v.union(v.number(), v.null()),
  clickCount: v.number(),
  lastClickedAt: v.union(v.number(), v.null()),
  status: v.union(v.literal("active"), v.literal("disabled"), v.literal("expired")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const detailValue = v.object({
  _id: v.id("shortLinks"),
  slug: v.string(),
  destinationUrl: v.string(),
  label: v.string(),
  enabled: v.boolean(),
  eventId: v.union(v.id("events"), v.null()),
  eventTitle: v.union(v.string(), v.null()),
  expiryMode: expiryModeValue,
  expiresAt: v.union(v.number(), v.null()),
  manualExpiresAtDate: v.string(),
  clickCount: v.number(),
  lastClickedAt: v.union(v.number(), v.null()),
  status: v.union(v.literal("active"), v.literal("disabled"), v.literal("expired")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

function sortByRecency(links: Doc<"shortLinks">[]) {
  return links.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

async function eventTitleFor(
  ctx: { db: { get: (id: Id<"events">) => Promise<Doc<"events"> | null> } },
  eventId?: Id<"events">,
) {
  if (!eventId) return null;
  const event = await ctx.db.get(eventId);
  return event?.title ?? null;
}

function manualDateFromExpiresAt(expiresAt?: number) {
  if (expiresAt == null) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(expiresAt));
}

async function clickStatsFor(
  ctx: QueryCtx | MutationCtx,
  link: Pick<Doc<"shortLinks">, "_id" | "clickCount" | "lastClickedAt">,
) {
  const clicks = await ctx.db
    .query("shortLinkClicks")
    .withIndex("by_shortLinkId", (q) => q.eq("shortLinkId", link._id))
    .take(MAX_CLICKS_PER_LINK);
  let lastClickedAt = link.lastClickedAt ?? null;
  for (const click of clicks) {
    if (lastClickedAt == null || click.clickedAt > lastClickedAt) {
      lastClickedAt = click.clickedAt;
    }
  }
  return {
    clickCount: link.clickCount + clicks.length,
    lastClickedAt,
  };
}

async function deleteClicksFor(ctx: MutationCtx, shortLinkId: Id<"shortLinks">) {
  for (;;) {
    const batch = await ctx.db
      .query("shortLinkClicks")
      .withIndex("by_shortLinkId", (q) => q.eq("shortLinkId", shortLinkId))
      .take(CLICK_DELETE_BATCH);
    if (batch.length === 0) break;
    for (const click of batch) {
      await ctx.db.delete(click._id);
    }
    if (batch.length < CLICK_DELETE_BATCH) break;
  }
}

async function toListRow(
  ctx: QueryCtx | MutationCtx,
  link: Doc<"shortLinks">,
  eventTitle: string | null,
  now = Date.now(),
) {
  const stats = await clickStatsFor(ctx, link);
  return {
    _id: link._id,
    slug: link.slug,
    destinationUrl: link.destinationUrl,
    label: link.label ?? "",
    enabled: link.enabled,
    eventId: link.eventId ?? null,
    eventTitle,
    expiryMode: link.expiryMode,
    expiresAt: link.expiresAt ?? null,
    clickCount: stats.clickCount,
    lastClickedAt: stats.lastClickedAt,
    status: shortLinkStatus(link, now),
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

export const list = query({
  args: {},
  returns: v.array(listRowValue),
  handler: async (ctx) => {
    await requireVerticalOrAdmin(ctx, "Marketing");
    const links = sortByRecency(await ctx.db.query("shortLinks").take(500));
    const now = Date.now();
    return Promise.all(
      links.map(async (link) =>
        toListRow(ctx, link, await eventTitleFor(ctx, link.eventId), now),
      ),
    );
  },
});

export const getById = query({
  args: { id: v.id("shortLinks") },
  returns: v.union(detailValue, v.null()),
  handler: async (ctx, args) => {
    await requireVerticalOrAdmin(ctx, "Marketing");
    const link = await ctx.db.get(args.id);
    if (!link) return null;
    const now = Date.now();
    return {
      ...(await toListRow(ctx, link, await eventTitleFor(ctx, link.eventId), now)),
      manualExpiresAtDate:
        link.expiryMode === "manual" ? manualDateFromExpiresAt(link.expiresAt) : "",
    };
  },
});

export const create = mutation({
  args: {
    slug: v.string(),
    destinationUrl: v.string(),
    label: v.optional(v.string()),
    enabled: v.boolean(),
    eventId: v.optional(v.id("events")),
    expiryMode: expiryModeValue,
    manualExpiresAtDate: v.optional(v.string()),
  },
  returns: v.id("shortLinks"),
  handler: async (ctx, args) => {
    const user = await requireVerticalOrAdmin(ctx, "Marketing");
    const slug = normalizeShortLinkSlug(args.slug);
    await assertUniqueShortLinkSlug(ctx, slug);
    const destinationUrl = validateShortLinkDestinationUrl(args.destinationUrl);
    const now = Date.now();
    const expiresAt = await resolveShortLinkExpiresAt(ctx, {
      expiryMode: args.expiryMode,
      manualExpiresAtDate: args.manualExpiresAtDate,
      eventId: args.eventId,
    });
    return await ctx.db.insert("shortLinks", {
      slug,
      destinationUrl,
      label: args.label?.trim() || undefined,
      enabled: args.enabled,
      eventId: args.eventId,
      expiryMode: args.expiryMode,
      expiresAt,
      clickCount: 0,
      createdByUserId: getUserId(user),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("shortLinks"),
    slug: v.string(),
    destinationUrl: v.string(),
    label: v.optional(v.string()),
    enabled: v.boolean(),
    eventId: v.optional(v.id("events")),
    expiryMode: expiryModeValue,
    manualExpiresAtDate: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireVerticalOrAdmin(ctx, "Marketing");
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Short link not found.");
    }
    const slug = normalizeShortLinkSlug(args.slug);
    await assertUniqueShortLinkSlug(ctx, slug, args.id);
    const destinationUrl = validateShortLinkDestinationUrl(args.destinationUrl);
    const expiresAt = await resolveShortLinkExpiresAt(ctx, {
      expiryMode: args.expiryMode,
      manualExpiresAtDate: args.manualExpiresAtDate,
      eventId: args.eventId,
    });
    await ctx.db.patch(args.id, {
      slug,
      destinationUrl,
      label: args.label?.trim() || undefined,
      enabled: args.enabled,
      eventId: args.eventId,
      expiryMode: args.expiryMode,
      expiresAt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("shortLinks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireVerticalOrAdmin(ctx, "Marketing");
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Short link not found.");
    }
    await deleteClicksFor(ctx, args.id);
    await ctx.db.delete(args.id);
    return null;
  },
});

export const lookupBySlugInternal = internalQuery({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      destinationUrl: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("shortLinks")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!link || isShortLinkExpired(link)) {
      return null;
    }
    return { destinationUrl: link.destinationUrl };
  },
});

export const recordClick = internalMutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("shortLinks")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!link || isShortLinkExpired(link)) {
      return null;
    }
    // Insert-only: concurrent clicks do not contend on the shortLinks row.
    await ctx.db.insert("shortLinkClicks", {
      shortLinkId: link._id,
      clickedAt: Date.now(),
    });
    return null;
  },
});

export const pruneExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("shortLinks")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
      .take(500);
    for (const link of expired) {
      if (link.expiresAt != null && link.expiresAt <= now) {
        await deleteClicksFor(ctx, link._id);
        await ctx.db.delete(link._id);
      }
    }
    return null;
  },
});

export const importFromKv = internalMutation({
  args: {
    entries: v.array(
      v.object({
        slug: v.string(),
        destinationUrl: v.string(),
        label: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({
    inserted: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    let inserted = 0;
    let skipped = 0;
    const now = Date.now();
    for (const entry of args.entries) {
      let slug: string;
      try {
        slug = normalizeShortLinkSlug(entry.slug);
      } catch {
        skipped += 1;
        continue;
      }
      const existing = await ctx.db
        .query("shortLinks")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (existing) {
        skipped += 1;
        continue;
      }
      let destinationUrl: string;
      try {
        destinationUrl = validateShortLinkDestinationUrl(entry.destinationUrl);
      } catch {
        skipped += 1;
        continue;
      }
      await ctx.db.insert("shortLinks", {
        slug,
        destinationUrl,
        label: entry.label?.trim() || slug,
        enabled: true,
        expiryMode: "none",
        clickCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      inserted += 1;
    }
    return { inserted, skipped };
  },
});

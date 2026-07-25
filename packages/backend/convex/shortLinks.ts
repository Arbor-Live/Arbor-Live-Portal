import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
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

const SHORT_LINK_LIST_LIMIT = 200;

/**
 * Titles for every distinct event referenced by a page of links. One lookup per
 * event rather than one per link — several links commonly point at the same event.
 */
async function eventTitlesFor(ctx: QueryCtx, links: Doc<"shortLinks">[]) {
  const ids = [...new Set(links.map((link) => link.eventId).filter(Boolean))] as Id<"events">[];
  const entries = await Promise.all(
    ids.map(async (id) => [id, (await ctx.db.get(id))?.title ?? null] as const),
  );
  return new Map(entries);
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

function toListRow(
  link: Doc<"shortLinks">,
  eventTitle: string | null,
  now = Date.now(),
) {
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
    clickCount: link.clickCount,
    lastClickedAt: link.lastClickedAt ?? null,
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
    const links = await ctx.db
      .query("shortLinks")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(SHORT_LINK_LIST_LIMIT);
    const titles = await eventTitlesFor(ctx, links);
    const now = Date.now();
    return links.map((link) =>
      toListRow(link, link.eventId ? (titles.get(link.eventId) ?? null) : null, now),
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
      ...toListRow(link, await eventTitleFor(ctx, link.eventId), now),
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
    const now = Date.now();
    await ctx.db.patch(link._id, {
      clickCount: link.clickCount + 1,
      lastClickedAt: now,
      updatedAt: now,
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

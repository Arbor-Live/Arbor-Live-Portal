import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserId, requireAdmin } from "./lib/auth";
import { normalizeOptionalAssetReference } from "./lib/inventoryUpload";
import { normalizeFeaturedStats, resolveLexicalContentJson } from "./lib/marketingContent";
import {
  assertUniqueMarketingPostSlug,
  normalizePublicSlug,
} from "./lib/publicSlug";

const marketingPostKindValue = v.union(v.literal("case_study"), v.literal("blog"));

const featuredStatInputValue = v.object({
  label: v.string(),
  value: v.string(),
});

const EMPTY_LEXICAL_STATE = JSON.stringify({
  root: {
    children: [
      {
        children: [],
        direction: null,
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      },
    ],
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

function normalizeContentJson(raw: string | undefined) {
  const value = raw?.trim();
  if (!value) return EMPTY_LEXICAL_STATE;
  try {
    JSON.parse(value);
    return value;
  } catch {
    throw new Error("Post body must be valid Lexical JSON.");
  }
}

function sortPostsByRecency<T extends { publishedAt?: number; updatedAt: number }>(posts: T[]) {
  return posts.slice().sort((a, b) => {
    const aTime = a.publishedAt ?? a.updatedAt;
    const bTime = b.publishedAt ?? b.updatedAt;
    return bTime - aTime;
  });
}

export const listAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const posts = await ctx.db.query("marketingPosts").take(500);
    return sortPostsByRecency(posts).map((post) => ({
      _id: post._id,
      title: post.title,
      slug: post.slug ?? "",
      excerpt: post.excerpt ?? "",
      kind: post.kind,
      heroImageUrl: post.heroImageUrl ?? "",
      featuredStats: post.featuredStats ?? [],
      contentJson: post.contentJson,
      published: post.published,
      featured: post.featured,
      publishedAt: post.publishedAt ?? null,
      updatedAt: post.updatedAt,
    }));
  },
});

export const getById = query({
  args: { id: v.id("marketingPosts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const post = await ctx.db.get(args.id);
    if (!post) return null;
    return {
      _id: post._id,
      title: post.title,
      slug: post.slug ?? "",
      excerpt: post.excerpt ?? "",
      kind: post.kind,
      heroImageUrl: post.heroImageUrl ?? "",
      featuredStats: post.featuredStats ?? [],
      contentJson: post.contentJson,
      published: post.published,
      featured: post.featured,
      publishedAt: post.publishedAt ?? null,
      updatedAt: post.updatedAt,
    };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    slug: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    kind: marketingPostKindValue,
    heroImageUrl: v.optional(v.string()),
    featuredStats: v.optional(v.array(featuredStatInputValue)),
    contentJson: v.optional(v.string()),
    published: v.optional(v.boolean()),
    featured: v.optional(v.boolean()),
    publishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const title = args.title.trim();
    if (!title) throw new Error("Title is required.");

    const published = args.published ?? false;
    const featured = args.featured ?? false;
    const slug = args.slug === undefined ? undefined : normalizePublicSlug(args.slug);
    if (published && !slug) {
      throw new Error("Published posts require a public slug.");
    }
    if (slug) {
      await assertUniqueMarketingPostSlug(ctx, slug);
    }

    const publishedAt =
      published ? (args.publishedAt ?? now) : args.publishedAt ?? undefined;

    return await ctx.db.insert("marketingPosts", {
      title,
      slug: published ? slug : slug ?? undefined,
      excerpt: args.excerpt?.trim() || undefined,
      kind: args.kind,
      heroImageUrl: normalizeOptionalAssetReference(args.heroImageUrl),
      featuredStats: normalizeFeaturedStats(args.featuredStats),
      contentJson: normalizeContentJson(args.contentJson),
      published,
      featured: published ? featured : false,
      publishedAt,
      updatedByUserId: getUserId(admin) || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("marketingPosts"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    kind: v.optional(marketingPostKindValue),
    heroImageUrl: v.optional(v.string()),
    featuredStats: v.optional(v.array(featuredStatInputValue)),
    contentJson: v.optional(v.string()),
    published: v.optional(v.boolean()),
    featured: v.optional(v.boolean()),
    publishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Post not found.");

    const now = Date.now();
    const published = args.published ?? existing.published;
    const featured = args.featured ?? existing.featured;
    const slug =
      args.slug === undefined
        ? existing.slug
        : args.slug.trim()
          ? normalizePublicSlug(args.slug)
          : undefined;

    if (published && !slug) {
      throw new Error("Published posts require a public slug.");
    }
    if (slug) {
      await assertUniqueMarketingPostSlug(ctx, slug, args.id);
    }

    let publishedAt = existing.publishedAt;
    if (args.publishedAt !== undefined) {
      publishedAt = args.publishedAt;
    } else if (published && !existing.published) {
      publishedAt = now;
    } else if (!published) {
      publishedAt = undefined;
    }

    await ctx.db.patch(args.id, {
      title: args.title?.trim() || existing.title,
      slug: published ? slug : slug ?? undefined,
      excerpt: args.excerpt !== undefined ? args.excerpt.trim() || undefined : existing.excerpt,
      kind: args.kind ?? existing.kind,
      heroImageUrl:
        args.heroImageUrl !== undefined
          ? normalizeOptionalAssetReference(args.heroImageUrl)
          : existing.heroImageUrl,
      featuredStats:
        args.featuredStats !== undefined
          ? normalizeFeaturedStats(args.featuredStats)
          : existing.featuredStats,
      contentJson:
        args.contentJson !== undefined
          ? normalizeContentJson(args.contentJson)
          : existing.contentJson,
      published,
      featured: published ? featured : false,
      publishedAt,
      updatedByUserId: getUserId(admin) || undefined,
      updatedAt: now,
    });

    return args.id;
  },
});

export const remove = mutation({
  args: { id: v.id("marketingPosts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Post not found.");
    await ctx.db.delete(args.id);
    return null;
  },
});

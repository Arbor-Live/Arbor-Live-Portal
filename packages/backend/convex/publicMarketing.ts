import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { resolveStoredR2AssetUrl } from "./inventoryR2";
import { resolveLexicalContentJson } from "./lib/marketingContent";

const marketingPostKindValue = v.union(v.literal("case_study"), v.literal("blog"));

const featuredStatValue = v.object({
  label: v.string(),
  value: v.string(),
});

async function resolveHeroImageUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const resolved = await resolveStoredR2AssetUrl(trimmed);
  if (resolved) return resolved;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return undefined;
}

function sortPublishedPosts(posts: Doc<"marketingPosts">[]) {
  return posts.slice().sort((a, b) => {
    const aTime = a.publishedAt ?? a.updatedAt;
    const bTime = b.publishedAt ?? b.updatedAt;
    return bTime - aTime;
  });
}

async function toPublicCard(post: Doc<"marketingPosts">) {
  return {
    slug: post.slug!,
    title: post.title,
    excerpt: post.excerpt?.trim() || undefined,
    kind: post.kind,
    heroImageUrl: await resolveHeroImageUrl(post.heroImageUrl),
    publishedAt: post.publishedAt ?? post.updatedAt,
  };
}

export const listFeaturedPosts = query({
  args: {},
  returns: v.array(
    v.object({
      slug: v.string(),
      title: v.string(),
      excerpt: v.optional(v.string()),
      kind: marketingPostKindValue,
      heroImageUrl: v.optional(v.string()),
      publishedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const posts = await ctx.db
      .query("marketingPosts")
      .withIndex("by_published_and_featured", (q) => q.eq("published", true).eq("featured", true))
      .take(50);

    const published = sortPublishedPosts(posts.filter((post) => post.slug?.trim()));
    return Promise.all(published.map((post) => toPublicCard(post)));
  },
});

export const listPublishedSlugs = query({
  args: {},
  returns: v.array(v.object({ slug: v.string() })),
  handler: async (ctx) => {
    const posts = await ctx.db
      .query("marketingPosts")
      .withIndex("by_published_and_publishedAt", (q) => q.eq("published", true))
      .take(200);

    return posts
      .filter((post) => post.slug?.trim())
      .map((post) => ({ slug: post.slug!.trim().toLowerCase() }));
  },
});

export const listPublishedPosts = query({
  args: {
    kind: v.optional(marketingPostKindValue),
  },
  returns: v.array(
    v.object({
      slug: v.string(),
      title: v.string(),
      excerpt: v.optional(v.string()),
      kind: marketingPostKindValue,
      heroImageUrl: v.optional(v.string()),
      publishedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const posts = await ctx.db
      .query("marketingPosts")
      .withIndex("by_published_and_publishedAt", (q) => q.eq("published", true))
      .take(200);

    const filtered = sortPublishedPosts(
      posts.filter((post) => {
        if (!post.slug?.trim()) return false;
        if (args.kind && post.kind !== args.kind) return false;
        return true;
      }),
    ).slice(0, 50);

    return Promise.all(filtered.map((post) => toPublicCard(post)));
  },
});

export const getPublishedPostBySlug = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      slug: v.string(),
      title: v.string(),
      excerpt: v.optional(v.string()),
      kind: marketingPostKindValue,
      heroImageUrl: v.optional(v.string()),
      featuredStats: v.array(featuredStatValue),
      contentJson: v.string(),
      publishedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const slug = args.slug.trim().toLowerCase();
    if (!slug) return null;

    const post = await ctx.db
      .query("marketingPosts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!post || !post.published || !post.slug) return null;

    return {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt?.trim() || undefined,
      kind: post.kind,
      heroImageUrl: await resolveHeroImageUrl(post.heroImageUrl),
      featuredStats: post.featuredStats ?? [],
      contentJson: await resolveLexicalContentJson(post.contentJson),
      publishedAt: post.publishedAt ?? post.updatedAt,
    };
  },
});

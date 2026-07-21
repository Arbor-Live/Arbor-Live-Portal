import type { MutationCtx, QueryCtx } from "../_generated/server";

const MAX_SLUG_LENGTH = 200;

export function normalizeShortLinkSlug(raw: string | undefined) {
  const slug = raw?.trim().replace(/^\/+|\/+$/g, "");
  if (!slug) {
    throw new Error("Slug is required.");
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    throw new Error(`Slug must be ${MAX_SLUG_LENGTH} characters or fewer.`);
  }
  if (slug.includes("..")) {
    throw new Error("Slug cannot contain '..'.");
  }
  if (slug.includes("://")) {
    throw new Error("Slug cannot contain a URL scheme.");
  }
  return slug;
}

export async function assertUniqueShortLinkSlug(
  ctx: MutationCtx | QueryCtx,
  slug: string,
  excludeId?: import("../_generated/dataModel").Id<"shortLinks">,
) {
  const match = await ctx.db
    .query("shortLinks")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (match && (!excludeId || match._id !== excludeId)) {
    throw new Error("This short-link slug is already in use.");
  }
}

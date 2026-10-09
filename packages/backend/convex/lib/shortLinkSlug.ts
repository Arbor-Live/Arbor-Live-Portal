import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";

const MAX_SLUG_LENGTH = 200;

export function normalizeShortLinkSlug(raw: string | undefined) {
  const slug = raw?.trim().replace(/^\/+|\/+$/g, "");
  if (!slug) {
    appError("SHORT_LINK_SLUG_REQUIRED", "Slug is required.");
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    appError("SHORT_LINK_SLUG_TOO_LONG", `Slug must be ${MAX_SLUG_LENGTH} characters or fewer.`);
  }
  if (slug.includes("..")) {
    appError("SHORT_LINK_SLUG_DOT_DOT", "Slug cannot contain '..'.");
  }
  if (slug.includes("://")) {
    appError("SHORT_LINK_SLUG_URL_SCHEME", "Slug cannot contain a URL scheme.");
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
    appError("SHORT_LINK_SLUG_TAKEN", "This short-link slug is already in use.");
  }
}

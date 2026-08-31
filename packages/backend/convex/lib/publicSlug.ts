import type { MutationCtx, QueryCtx } from "../_generated/server";

export function slugifyPublicSlugFromName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return undefined;
  return slug;
}

export function resolveBandPublicSlug(args: {
  slugInput: string | undefined;
  publicListing: boolean | undefined;
  displayName: string | undefined;
}) {
  const fromInput =
    args.slugInput === undefined ? undefined : normalizePublicSlug(args.slugInput);
  if (fromInput) return fromInput;
  if (args.publicListing) {
    const fromName = slugifyPublicSlugFromName(args.displayName ?? "");
    if (fromName) return fromName;
  }
  return undefined;
}

export function normalizePublicSlug(raw: string | undefined) {
  const slug = raw?.trim().toLowerCase();
  if (!slug) return undefined;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Public slug must be lowercase letters/numbers with single dashes.");
  }
  return slug;
}

export async function assertUniqueBandPublicSlug(
  ctx: MutationCtx | QueryCtx,
  slug: string | undefined,
  excludeOrganizationId?: string,
) {
  if (!slug) return;
  const match = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_publicSlug", (q) => q.eq("publicSlug", slug))
    .unique();
  if (match && (!excludeOrganizationId || match.organizationId !== excludeOrganizationId)) {
    throw new Error("Public slug is already in use by another artist profile.");
  }
}

export async function assertUniqueMarketingPostSlug(
  ctx: MutationCtx | QueryCtx,
  slug: string | undefined,
  excludePostId?: import("../_generated/dataModel").Id<"marketingPosts">,
) {
  if (!slug) return;
  const match = await ctx.db
    .query("marketingPosts")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (match && (!excludePostId || match._id !== excludePostId)) {
    throw new Error("Public slug is already in use by another post.");
  }
}

import { v } from "convex/values";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { getUserId, type AuthUser } from "./lib/auth";

type OrganizationRow = {
  id?: string;
  _id?: string;
  name?: string;
  slug?: string;
};

function getRecordId(row: { id?: string; _id?: string } | null | undefined) {
  return row?.id ?? row?._id ?? "";
}

function isArborLiveOrg(org: OrganizationRow) {
  const name = (org.name ?? "").trim().toLowerCase();
  const slug = (org.slug ?? "").trim().toLowerCase();
  return name === "arbor live" || slug === "arbor-live";
}

async function getAllAuthUsers(ctx: QueryCtx) {
  const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "user",
    paginationOpts: { cursor: null, numItems: 1000 },
  });
  return (result?.page ?? []) as AuthUser[];
}

async function getArborLiveOrganizationId(ctx: QueryCtx) {
  const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "organization",
    paginationOpts: { cursor: null, numItems: 500 },
  });
  const organizations = (result?.page ?? []) as OrganizationRow[];
  const arbor = organizations.find(isArborLiveOrg);
  return arbor ? getRecordId(arbor) : null;
}

function bioExcerpt(bio: string | undefined, maxLen = 140) {
  const text = bio?.trim();
  if (!text) return undefined;
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}…`;
}

export const listPublicCrew = query({
  args: {},
  handler: async (ctx) => {
    const arborOrgId = await getArborLiveOrganizationId(ctx);
    if (!arborOrgId) return [];

    const memberships = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", arborOrgId))
      .collect();

    const activeMemberIds = new Set(
      memberships.filter((row) => row.active).map((row) => row.userId),
    );
    if (!activeMemberIds.size) return [];

    const profiles = await ctx.db.query("userAdminProfiles").withIndex("by_active").take(2000);
    const publicProfiles = profiles.filter(
      (profile) =>
        activeMemberIds.has(profile.userId) &&
        profile.active &&
        profile.showOnPublicCrewPage === true,
    );
    if (!publicProfiles.length) return [];

    const users = await getAllAuthUsers(ctx);
    const userById = new Map(users.map((user) => [getUserId(user), user]));

    return publicProfiles
      .map((profile) => {
        const user = userById.get(profile.userId);
        const name = user?.name?.trim() || "Arbor Live crew";
        const image =
          (user as { image?: string | null } | undefined)?.image?.trim() || undefined;
        return {
          id: profile.userId,
          name,
          teams: profile.teams,
          imageUrl: image,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listPublicArtists = query({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationType", (q) => q.eq("organizationType", "band"))
      .take(500);

    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "organization",
      paginationOpts: { cursor: null, numItems: 500 },
    });
    const organizations = (result?.page ?? []) as OrganizationRow[];
    const orgNameById = new Map(organizations.map((org) => [getRecordId(org), org.name ?? ""]));

    return profiles
      .filter((profile) => profile.publicListing === true && profile.publicSlug?.trim())
      .map((profile) => ({
        slug: profile.publicSlug!,
        displayName:
          profile.displayName?.trim() ||
          orgNameById.get(profile.organizationId) ||
          "Artist",
        bioExcerpt: bioExcerpt(profile.bio),
        heroImageUrl: profile.publicHeroImageUrl?.trim() || undefined,
        instagramUrl: profile.publicInstagramUrl?.trim() || undefined,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },
});

export const getPublicArtistBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const slug = args.slug.trim().toLowerCase();
    if (!slug) return null;

    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_publicSlug", (q) => q.eq("publicSlug", slug))
      .unique();
    if (!profile || profile.organizationType !== "band" || profile.publicListing !== true) {
      return null;
    }

    const result = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "organization",
      where: [{ field: "id", value: profile.organizationId }],
    });
    const organization = result as OrganizationRow | null;
    const orgResult = organization
      ? organization
      : ((await ctx.runQuery(components.betterAuth.adapter.findOne, {
          model: "organization",
          where: [{ field: "_id", value: profile.organizationId }],
        })) as OrganizationRow | null);

    return {
      slug: profile.publicSlug!,
      displayName:
        profile.displayName?.trim() ||
        orgResult?.name?.trim() ||
        "Artist",
      bio: profile.bio?.trim() || undefined,
      heroImageUrl: profile.publicHeroImageUrl?.trim() || undefined,
      websiteUrl: profile.publicWebsiteUrl?.trim() || undefined,
      instagramUrl: profile.publicInstagramUrl?.trim() || undefined,
      youtubeUrl: profile.publicYoutubeUrl?.trim() || undefined,
    };
  },
});

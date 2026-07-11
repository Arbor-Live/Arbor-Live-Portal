import { v } from "convex/values";
import { components } from "./_generated/api";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { resolveStoredR2AssetUrl } from "./inventoryR2";
import { getUserId, type AuthUser } from "./lib/auth";
import {
  getPrimaryVertical,
  getSecondaryTags,
  PUBLIC_CREW_SECTION_LABELS,
  PUBLIC_CREW_SECTION_ORDER,
  resolveProfileMembership,
  type UserVertical,
} from "./lib/userVerticals";

type OrganizationRow = {
  id?: string;
  _id?: string;
  name?: string;
  slug?: string;
};

const CREW_GENERAL_SECTION = "General" as const;

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

async function resolvePublicHeroImageUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return (await resolveStoredR2AssetUrl(trimmed)) ?? trimmed;
}

async function resolveCrewMemberImageUrl(
  ctx: QueryCtx,
  profile: {
    avatarStorageId?: import("./_generated/dataModel").Id<"_storage">;
  },
  user: AuthUser | undefined,
) {
  const authImage = (user as { image?: string | null } | undefined)?.image?.trim();
  if (authImage) {
    const resolved = await resolveStoredR2AssetUrl(authImage);
    if (resolved) return resolved;
    if (/^https?:\/\//i.test(authImage)) return authImage;
  }
  if (profile.avatarStorageId) {
    return (await ctx.storage.getUrl(profile.avatarStorageId)) ?? undefined;
  }
  return undefined;
}

export const listPublicCrew = query({
  args: {},
  returns: v.object({
    sections: v.array(
      v.object({
        team: v.string(),
        label: v.string(),
        members: v.array(
          v.object({
            id: v.string(),
            name: v.string(),
            imageUrl: v.optional(v.string()),
            description: v.optional(v.string()),
            secondaryTags: v.array(v.string()),
          }),
        ),
      }),
    ),
  }),
  handler: async (ctx) => {
    const arborOrgId = await getArborLiveOrganizationId(ctx);
    if (!arborOrgId) return { sections: [] };

    const memberships = await ctx.db
      .query("userOrganizationMemberships")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", arborOrgId))
      .take(1000);

    const activeMemberIds = new Set(
      memberships.filter((row) => row.active).map((row) => row.userId),
    );
    if (!activeMemberIds.size) return { sections: [] };

    const profiles = await ctx.db.query("userAdminProfiles").withIndex("by_active").take(2000);
    const publicProfiles = profiles.filter(
      (profile) =>
        activeMemberIds.has(profile.userId) &&
        profile.active &&
        profile.showOnPublicCrewPage === true,
    );
    if (!publicProfiles.length) return { sections: [] };

    const users = await getAllAuthUsers(ctx);
    const userById = new Map(users.map((user) => [getUserId(user), user]));

    const membersByTeam = new Map<
      UserVertical | typeof CREW_GENERAL_SECTION,
      Array<{
        id: string;
        name: string;
        imageUrl?: string;
        description?: string;
        secondaryTags: string[];
      }>
    >();
    for (const team of PUBLIC_CREW_SECTION_ORDER) {
      membersByTeam.set(team, []);
    }
    membersByTeam.set(CREW_GENERAL_SECTION, []);

    for (const profile of publicProfiles) {
      const user = userById.get(profile.userId);
      const name = user?.name?.trim() || "Arbor Live crew";
      const imageUrl = await resolveCrewMemberImageUrl(ctx, profile, user);
      const description = profile.publicCrewDescription?.trim() || undefined;
      const membership = resolveProfileMembership(profile);
      const primaryVertical = getPrimaryVertical(membership.verticals);
      const secondaryTags = getSecondaryTags(
        membership.verticals,
        membership.disciplines,
        primaryVertical,
      );
      const member = {
        id: profile.userId,
        name,
        imageUrl,
        description,
        secondaryTags,
      };

      if (!primaryVertical) {
        membersByTeam.get(CREW_GENERAL_SECTION)?.push(member);
        continue;
      }

      membersByTeam.get(primaryVertical)?.push(member);
    }

    const sections: Array<{
      team: string;
      label: string;
      members: Array<{
        id: string;
        name: string;
        imageUrl?: string;
        description?: string;
        secondaryTags: string[];
      }>;
    }> = PUBLIC_CREW_SECTION_ORDER.flatMap((team) => {
      const members = (membersByTeam.get(team) ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!members.length) return [];
      return [
        {
          team,
          label: PUBLIC_CREW_SECTION_LABELS[team],
          members,
        },
      ];
    });

    const generalMembers = (membersByTeam.get(CREW_GENERAL_SECTION) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    if (generalMembers.length > 0) {
      sections.push({
        team: CREW_GENERAL_SECTION,
        label: "Crew",
        members: generalMembers,
      });
    }

    return { sections };
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

    const listed = profiles.filter(
      (profile) => profile.publicListing === true && profile.publicSlug?.trim(),
    );
    const rows = await Promise.all(
      listed.map(async (profile) => ({
        slug: profile.publicSlug!,
        displayName:
          profile.displayName?.trim() ||
          orgNameById.get(profile.organizationId) ||
          "Artist",
        bioExcerpt: bioExcerpt(profile.bio),
        heroImageUrl: await resolvePublicHeroImageUrl(profile.publicHeroImageUrl),
        instagramUrl: profile.publicInstagramUrl?.trim() || undefined,
      })),
    );
    return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
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
      heroImageUrl: await resolvePublicHeroImageUrl(profile.publicHeroImageUrl),
      websiteUrl: profile.publicWebsiteUrl?.trim() || undefined,
      instagramUrl: profile.publicInstagramUrl?.trim() || undefined,
      youtubeUrl: profile.publicYoutubeUrl?.trim() || undefined,
    };
  },
});

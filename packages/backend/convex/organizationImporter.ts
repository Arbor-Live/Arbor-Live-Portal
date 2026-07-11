import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

const organizationTypeValue = v.union(
  v.literal("arbor_internal"),
  v.literal("band"),
  v.literal("dj"),
);

type OrganizationRow = { id?: string; _id?: string; name?: string; slug?: string };

function getRecordId(row: { id?: string; _id?: string } | null | undefined) {
  return row?.id ?? row?._id ?? "";
}

function toSlug(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Imports each CSV row into both Better Auth's organization record and its Arbor profile. */
export const batchImport = mutation({
  args: {
    organizations: v.array(v.object({
      displayName: v.string(),
      orgCreationTime: v.optional(v.number()),
      numShowsRan: v.optional(v.number()),
      demoURL: v.optional(v.string()),
      genres: v.optional(v.array(v.string())),
      mainContactName: v.optional(v.string()),
      mainContactEmail: v.optional(v.string()),
      mainContactPhone: v.optional(v.string()),
      performerHourlyRateUsd: v.optional(v.number()),
      techRiderURL: v.optional(v.string()),
      status: v.optional(v.string()),
      bandMembers: v.optional(v.array(v.string())),
      oneLiner: v.optional(v.string()),
      organizationType: v.optional(organizationTypeValue),
    })),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    let created = 0;
    let updated = 0;

    for (const organization of args.organizations) {
      const displayName = organization.displayName.trim();
      if (!displayName) continue;
      const slug = toSlug(displayName);
      if (!slug) throw new Error(`Organization name "${displayName}" cannot be converted to a URL slug.`);

      let authOrganization = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "organization",
        where: [{ field: "slug", value: slug }],
      })) as OrganizationRow | null;
      if (!authOrganization) {
        authOrganization = (await ctx.runMutation(components.betterAuth.adapter.create, {
          input: { model: "organization", data: { name: displayName, slug, createdAt: now } },
        })) as OrganizationRow;
        created += 1;
      } else {
        updated += 1;
      }

      const organizationId = getRecordId(authOrganization);
      if (!organizationId) throw new Error(`Could not create organization "${displayName}".`);
      const existingProfile = await ctx.db
        .query("organizationProfiles")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .unique();
      const profile = {
        ...organization,
        displayName,
        organizationType: organization.organizationType ?? "band",
        updatedAt: now,
      };
      if (existingProfile) {
        await ctx.db.patch(existingProfile._id, profile);
      } else {
        await ctx.db.insert("organizationProfiles", { organizationId, ...profile });
      }
    }

    return { count: created + updated, created, updated };
  },
});

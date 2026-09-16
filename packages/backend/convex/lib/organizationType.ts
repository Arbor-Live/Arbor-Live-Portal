import { v } from "convex/values";

/**
 * Editable artist org types on `organizationProfiles.organizationType`
 * (excludes arbor_internal). Mirror of the schema's `organizationTypeValue`.
 */
export const artistOrganizationTypeValue = v.union(
  v.literal("band"),
  v.literal("dj"),
  v.literal("singer_songwriter"),
  v.literal("other"),
);

export type ArtistOrganizationType = "band" | "dj" | "singer_songwriter" | "other";

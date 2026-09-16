import { v } from "convex/values";

/** Public-directory artist type. Keep in sync with the schema and web labels. */
export const artistTypeValue = v.union(
  v.literal("band"),
  v.literal("dj"),
  v.literal("singer_songwriter"),
  v.literal("other"),
);

export type ArtistType = "band" | "dj" | "singer_songwriter" | "other";

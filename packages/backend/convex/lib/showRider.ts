import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Which of an act's riders a show uses. A rider the act picked for the show
 * wins while it still exists (and, for the printed brief, is published).
 * Otherwise public surfaces take the default rider even if it is a draft; the
 * brief takes the published default, then the latest published rider.
 */
export function pickShowRider(
  riders: Doc<"bandRiders">[],
  pickedRiderId: Id<"bandRiders"> | undefined,
  options?: { publishedOnly?: boolean },
): { rider: Doc<"bandRiders"> | null; chosenForShow: boolean } {
  const published = riders
    .filter((rider) => rider.status === "published")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const picked = pickedRiderId ? riders.find((rider) => rider._id === pickedRiderId) : undefined;
  if (picked && (!options?.publishedOnly || picked.status === "published")) {
    return { rider: picked, chosenForShow: true };
  }
  const fallback = options?.publishedOnly
    ? (published.find((rider) => rider.isDefault) ?? published[0] ?? null)
    : (riders.find((rider) => rider.isDefault) ?? published[0] ?? null);
  return { rider: fallback, chosenForShow: false };
}

/**
 * The riders `pickShowRider` chooses from. Reads a page of the act's riders,
 * then makes sure the picked rider and the default are in it even when the act
 * has more riders than one page holds.
 */
export async function loadShowRiderCandidates(
  ctx: QueryCtx,
  organizationId: string,
  pickedRiderId: Id<"bandRiders"> | undefined,
): Promise<Doc<"bandRiders">[]> {
  const riders = await ctx.db
    .query("bandRiders")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(50);
  const byId = new Map(riders.map((rider) => [rider._id, rider] as const));
  if (pickedRiderId && !byId.has(pickedRiderId)) {
    const picked = await ctx.db.get(pickedRiderId);
    if (picked && picked.organizationId === organizationId) byId.set(picked._id, picked);
  }
  if (!riders.some((rider) => rider.isDefault)) {
    const fallbackDefault = await ctx.db
      .query("bandRiders")
      .withIndex("by_organizationId_and_isDefault", (q) =>
        q.eq("organizationId", organizationId).eq("isDefault", true),
      )
      .first();
    if (fallbackDefault) byId.set(fallbackDefault._id, fallbackDefault);
  }
  return [...byId.values()];
}

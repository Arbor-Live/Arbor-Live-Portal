import type { Doc, Id } from "../_generated/dataModel";

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

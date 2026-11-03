import {
  cartCandidateUserIds,
  evaluateCartRequirement,
  type CartRequirement,
  type CartSection,
} from "@arbor/format";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { crewSections } from "./crewAvailability";
import { computeShiftStats } from "./crewShiftKinds";

type ProfileWithCart = { userId: string; cartEligible?: boolean };

/** Each crew section with the shifts linked to it (by `scheduleBlockId`). */
export function cartSectionsFromDocs(
  blocks: Doc<"eventScheduleBlocks">[],
  shifts: Pick<Doc<"eventCrewShifts">, "scheduleBlockId" | "userId" | "crewApplicationId">[],
): CartSection[] {
  return crewSections(blocks).map((block) => ({
    blockType: block.blockType,
    shifts: shifts.filter((shift) => shift.scheduleBlockId === block._id),
  }));
}

/**
 * The cart rule for one event (`@arbor/format` `evaluateCartRequirement`).
 * Free on events that aren't cart events: no reads at all. On a cart event it
 * reads the blocks (unless passed) and one indexed profile per setup/strike
 * assignee not already in `knownProfiles`.
 */
export async function loadCartRequirement(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"events">,
  args: {
    shifts: Pick<Doc<"eventCrewShifts">, "scheduleBlockId" | "userId" | "crewApplicationId">[];
    blocks?: Doc<"eventScheduleBlocks">[];
    knownProfiles?: ReadonlyMap<string, ProfileWithCart>;
  },
): Promise<CartRequirement> {
  if (!event.needsCart) {
    return evaluateCartRequirement({ needsCart: false, sections: [], isCartEligible: () => false });
  }
  const blocks =
    args.blocks ??
    (await ctx.db
      .query("eventScheduleBlocks")
      .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", event._id))
      .take(200));
  const sections = cartSectionsFromDocs(blocks, args.shifts);
  const cartEligible = new Set<string>();
  const missing: string[] = [];
  for (const userId of cartCandidateUserIds(sections)) {
    const known = args.knownProfiles?.get(userId);
    if (known) {
      if (known.cartEligible === true) cartEligible.add(userId);
    } else {
      missing.push(userId);
    }
  }
  const fetched = await Promise.all(
    missing.map((userId) =>
      ctx.db
        .query("userAdminProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique(),
    ),
  );
  for (const profile of fetched) {
    if (profile?.cartEligible === true) cartEligible.add(profile.userId);
  }
  return evaluateCartRequirement({
    needsCart: true,
    sections,
    isCartEligible: (userId) => cartEligible.has(userId),
  });
}

/**
 * `computeShiftStats` for a stored event, cart rule included: what every
 * needs-crew list, count and badge uses for "fully staffed".
 */
export async function computeEventShiftStats(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"events">,
  shifts: Pick<Doc<"eventCrewShifts">, "scheduleBlockId" | "userId" | "crewApplicationId">[],
  backupUserIds: ReadonlySet<string> | undefined,
  extra?: {
    blocks?: Doc<"eventScheduleBlocks">[];
    knownProfiles?: ReadonlyMap<string, ProfileWithCart>;
  },
) {
  const cart = await loadCartRequirement(ctx, event, { shifts, ...extra });
  return computeShiftStats(shifts, backupUserIds, { cartRequirementMet: cart.met });
}

import {
  CART_GROUPS,
  evaluateCartRequirement,
  type CartGroup,
  type CartRequirement,
} from "@/lib/format";
import { shiftBelongsToBlock } from "@/lib/event-schedule-draft";

/**
 * Cart events on the staffing board. The rule itself is shared with Convex
 * (`@arbor/format` `evaluateCartRequirement`); this adapts the board's draft
 * blocks and shifts to it and words the result.
 */

type BlockLike = Parameters<typeof shiftBelongsToBlock>[1] & { blockType: string };
type ShiftLike = Parameters<typeof shiftBelongsToBlock>[0] & {
  userId?: string;
  crewApplicationId?: string;
};

export function cartRequirementForDraft(args: {
  needsCart: boolean;
  sectionBlocks: BlockLike[];
  shifts: ShiftLike[];
  cartEligibleIds: ReadonlySet<string>;
}): CartRequirement {
  return evaluateCartRequirement({
    needsCart: args.needsCart,
    sections: args.needsCart
      ? args.sectionBlocks.map((block) => ({
          blockType: block.blockType,
          shifts: args.shifts.filter((shift) => shiftBelongsToBlock(shift, block)),
        }))
      : [],
    isCartEligible: (userId) => args.cartEligibleIds.has(userId),
  });
}

/**
 * How a group reads: `met` (someone cart eligible is on it), `missing` (people
 * are on it, none cart eligible: worth flagging), or `waiting` (no one on it
 * yet, so it's too early to warn).
 */
export type CartGroupTone = "met" | "missing" | "waiting";

export type CartGroupLine = {
  group: CartGroup;
  tone: CartGroupTone;
  text: string;
};

/** "setup ✓ Maya", "strike needs someone cart eligible", one per required group. */
export function cartGroupLines(
  requirement: CartRequirement,
  nameOf: (userId: string) => string,
): CartGroupLine[] {
  if (!requirement.needsCart) return [];
  return CART_GROUPS.flatMap<CartGroupLine>((group) => {
    const status = requirement[group];
    if (!status.required) return [];
    if (status.met) {
      return [{ group, tone: "met", text: `${group} ✓ ${status.cartUserIds.map(nameOf).join(", ")}` }];
    }
    return [
      {
        group,
        tone: status.assignedUserIds.length > 0 ? "missing" : "waiting",
        text: `${group} needs someone cart eligible`,
      },
    ];
  });
}

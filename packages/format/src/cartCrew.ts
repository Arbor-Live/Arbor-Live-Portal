/**
 * Cart events (`events.needsCart`): gear moves by golf cart, so setup and
 * strike each need someone cart eligible (`userAdminProfiles.cartEligible`).
 *
 * Sections fall into two groups. Every `setup` section (early setup included)
 * is the setup group; every `strike` section is the strike group. One
 * cart-eligible person assigned anywhere in a group covers that group. A group
 * with no sections asks for nothing. Trainees never count. Shared by the
 * staffing board (web) and the needs-crew lists and nav badge (Convex).
 */

export type CartGroup = "setup" | "strike";

export const CART_GROUPS: readonly CartGroup[] = ["setup", "strike"];

export const CART_GROUP_LABELS: Record<CartGroup, string> = {
  setup: "setup",
  strike: "strike",
};

type CartShift = {
  userId?: string;
  crewApplicationId?: unknown;
};

export type CartSection = {
  blockType: string;
  /** The shifts on this section (open slots and trainees are fine; they're skipped). */
  shifts: CartShift[];
};

export type CartGroupStatus = {
  /** The event has at least one section in this group. */
  required: boolean;
  /** Not required, or someone cart eligible is on it. */
  met: boolean;
  /** Anyone assigned to the group's sections (trainees excluded). */
  assignedUserIds: string[];
  /** The cart-eligible people among them. */
  cartUserIds: string[];
};

export type CartRequirement = {
  needsCart: boolean;
  setup: CartGroupStatus;
  strike: CartGroupStatus;
  /** Every required group is covered (always true when the event isn't a cart event). */
  met: boolean;
};

/** Which cart group a section belongs to, or null for show/custom sections. */
export function cartGroupForBlockType(blockType: string): CartGroup | null {
  if (blockType === "setup") return "setup";
  if (blockType === "strike") return "strike";
  return null;
}

function assignedUserId(shift: CartShift) {
  const userId = shift.userId?.trim();
  // A trainee shift has an application and no user, so it never gets here.
  return userId ? userId : null;
}

const NOT_REQUIRED: CartGroupStatus = {
  required: false,
  met: true,
  assignedUserIds: [],
  cartUserIds: [],
};

export function evaluateCartRequirement(args: {
  needsCart: boolean | undefined;
  sections: CartSection[];
  isCartEligible: (userId: string) => boolean;
}): CartRequirement {
  if (!args.needsCart) {
    return { needsCart: false, setup: NOT_REQUIRED, strike: NOT_REQUIRED, met: true };
  }
  const groups: Record<CartGroup, { required: boolean; assigned: Set<string> }> = {
    setup: { required: false, assigned: new Set() },
    strike: { required: false, assigned: new Set() },
  };
  for (const section of args.sections) {
    const group = cartGroupForBlockType(section.blockType);
    if (!group) continue;
    groups[group].required = true;
    for (const shift of section.shifts) {
      const userId = assignedUserId(shift);
      if (userId) groups[group].assigned.add(userId);
    }
  }
  const status = (group: CartGroup): CartGroupStatus => {
    const { required, assigned } = groups[group];
    if (!required) return NOT_REQUIRED;
    const assignedUserIds = [...assigned];
    const cartUserIds = assignedUserIds.filter((userId) => args.isCartEligible(userId));
    return { required, met: cartUserIds.length > 0, assignedUserIds, cartUserIds };
  };
  const setup = status("setup");
  const strike = status("strike");
  return { needsCart: true, setup, strike, met: setup.met && strike.met };
}

/** User ids worth looking up for the rule: anyone on a setup or strike section. */
export function cartCandidateUserIds(sections: CartSection[]) {
  const ids = new Set<string>();
  for (const section of sections) {
    if (!cartGroupForBlockType(section.blockType)) continue;
    for (const shift of section.shifts) {
      const userId = assignedUserId(shift);
      if (userId) ids.add(userId);
    }
  }
  return [...ids].sort();
}

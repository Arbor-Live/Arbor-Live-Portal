import { describe, expect, it } from "vitest";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { cartGroupLines, cartRequirementForDraft } from "@/lib/cart-crew";

function block(clientId: string, blockType: TimelineBlockDraft["blockType"], label: string = blockType) {
  return {
    clientId,
    blockType,
    label,
    dayIndex: 0,
    startsAt: "2026-10-20T16:00",
    endsAt: "2026-10-20T17:00",
    notes: "",
  } satisfies TimelineBlockDraft;
}

const early = block("early", "setup", "Early setup");
const setup = block("setup", "setup");
const show = block("show", "show");
const strike = block("strike", "strike");
const cartEligibleIds = new Set(["maya"]);
const names: Record<string, string> = { maya: "Maya", sam: "Sam" };
const nameOf = (userId: string) => names[userId] ?? userId;

describe("cartRequirementForDraft", () => {
  it("reads draft shifts linked by client ref", () => {
    const requirement = cartRequirementForDraft({
      needsCart: true,
      sectionBlocks: [early, setup, show, strike],
      shifts: [
        { scheduleBlockRef: "early", userId: "maya" },
        { scheduleBlockRef: "setup", userId: "sam" },
        { scheduleBlockRef: "strike", userId: "sam" },
        { scheduleBlockRef: "strike", crewApplicationId: "app_1" },
      ],
      cartEligibleIds,
    });
    expect(requirement.setup.met).toBe(true);
    expect(requirement.strike.met).toBe(false);
    expect(requirement.met).toBe(false);
  });

  it("is met on a non-cart event", () => {
    const requirement = cartRequirementForDraft({
      needsCart: false,
      sectionBlocks: [setup, strike],
      shifts: [{ scheduleBlockRef: "setup", userId: "sam" }],
      cartEligibleIds,
    });
    expect(requirement.met).toBe(true);
    expect(cartGroupLines(requirement, nameOf)).toEqual([]);
  });
});

describe("cartGroupLines", () => {
  it("names the cart person on a met group and flags an unmet one", () => {
    const requirement = cartRequirementForDraft({
      needsCart: true,
      sectionBlocks: [early, setup, strike],
      shifts: [
        { scheduleBlockRef: "early", userId: "maya" },
        { scheduleBlockRef: "strike", userId: "sam" },
      ],
      cartEligibleIds,
    });
    expect(cartGroupLines(requirement, nameOf)).toEqual([
      { group: "setup", tone: "met", text: "setup ✓ Maya" },
      { group: "strike", tone: "missing", text: "strike needs someone cart eligible" },
    ]);
  });

  it("stays quiet (waiting) on a group no one is on yet, and skips groups with no sections", () => {
    const requirement = cartRequirementForDraft({
      needsCart: true,
      sectionBlocks: [setup, show],
      shifts: [{ scheduleBlockRef: "setup" }],
      cartEligibleIds,
    });
    expect(cartGroupLines(requirement, nameOf)).toEqual([
      { group: "setup", tone: "waiting", text: "setup needs someone cart eligible" },
    ]);
  });
});

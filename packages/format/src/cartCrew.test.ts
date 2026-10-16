import { describe, expect, it } from "vitest";
import { cartCandidateUserIds, cartGroupForBlockType, evaluateCartRequirement } from "./index";

const CART_PEOPLE = new Set(["maya"]);
const isCartEligible = (userId: string) => CART_PEOPLE.has(userId);

const earlySetup = { blockType: "setup", shifts: [{ userId: "maya" }] };
const setup = { blockType: "setup", shifts: [{ userId: "sam" }, {}] };
const show = { blockType: "show", shifts: [{ userId: "maya" }] };
const strike = { blockType: "strike", shifts: [{ userId: "sam" }, { userId: "jo" }] };

describe("evaluateCartRequirement", () => {
  it("is always met on an event that isn't a cart event", () => {
    const result = evaluateCartRequirement({
      needsCart: false,
      sections: [setup, strike],
      isCartEligible,
    });
    expect(result.met).toBe(true);
    expect(result.needsCart).toBe(false);
    expect(result.setup.required).toBe(false);
    expect(result.strike.required).toBe(false);
    expect(evaluateCartRequirement({ needsCart: undefined, sections: [setup], isCartEligible }).met).toBe(true);
  });

  it("covers the whole setup group with one cart person on early setup", () => {
    const result = evaluateCartRequirement({
      needsCart: true,
      sections: [earlySetup, setup, show, strike],
      isCartEligible,
    });
    expect(result.setup).toMatchObject({ required: true, met: true, cartUserIds: ["maya"] });
    expect(result.setup.assignedUserIds.sort()).toEqual(["maya", "sam"]);
  });

  it("leaves strike unmet when no one cart eligible is on it", () => {
    const result = evaluateCartRequirement({
      needsCart: true,
      sections: [earlySetup, setup, show, strike],
      isCartEligible,
    });
    expect(result.strike).toMatchObject({ required: true, met: false, cartUserIds: [] });
    expect(result.met).toBe(false);
  });

  it("doesn't count a cart person who is only on the show", () => {
    const result = evaluateCartRequirement({
      needsCart: true,
      sections: [setup, show],
      isCartEligible,
    });
    expect(result.setup.met).toBe(false);
    expect(result.met).toBe(false);
  });

  it("asks nothing of a group with no sections", () => {
    const result = evaluateCartRequirement({
      needsCart: true,
      sections: [earlySetup, show],
      isCartEligible,
    });
    expect(result.strike).toMatchObject({ required: false, met: true });
    expect(result.met).toBe(true);
    expect(evaluateCartRequirement({ needsCart: true, sections: [show], isCartEligible }).met).toBe(true);
  });

  it("doesn't count trainees", () => {
    const result = evaluateCartRequirement({
      needsCart: true,
      sections: [{ blockType: "strike", shifts: [{ crewApplicationId: "app_1" }, {}] }],
      // Even a checker that says yes to anything can't see a trainee.
      isCartEligible: () => true,
    });
    expect(result.strike).toMatchObject({ required: true, met: false, assignedUserIds: [] });
  });

  it("is met once both groups have a cart person", () => {
    const result = evaluateCartRequirement({
      needsCart: true,
      sections: [earlySetup, setup, { blockType: "strike", shifts: [{ userId: " maya " }] }],
      isCartEligible,
    });
    expect(result.met).toBe(true);
  });
});

describe("cart helpers", () => {
  it("maps block types to groups", () => {
    expect(cartGroupForBlockType("setup")).toBe("setup");
    expect(cartGroupForBlockType("strike")).toBe("strike");
    expect(cartGroupForBlockType("show")).toBeNull();
    expect(cartGroupForBlockType("custom")).toBeNull();
  });

  it("lists only setup and strike assignees to look up", () => {
    expect(cartCandidateUserIds([earlySetup, setup, show, strike])).toEqual(["jo", "maya", "sam"]);
    expect(cartCandidateUserIds([show])).toEqual([]);
  });
});

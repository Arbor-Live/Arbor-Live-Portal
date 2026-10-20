import { describe, expect, test } from "vitest";
import { eventNeedsCrew } from "./lib/crewTeams";

describe("eventNeedsCrew", () => {
  test("sound, lighting, photo or video count as crew", () => {
    expect(eventNeedsCrew(["Sound"])).toBe(true);
    expect(eventNeedsCrew(["Promotion", "Videography"])).toBe(true);
  });

  test("services-only events and trivia don't", () => {
    expect(eventNeedsCrew(undefined)).toBe(false);
    expect(eventNeedsCrew([])).toBe(false);
    expect(eventNeedsCrew(["Trivia", "Design", "Promotion", "Operations"])).toBe(false);
  });
});

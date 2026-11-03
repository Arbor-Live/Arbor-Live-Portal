import { describe, expect, test } from "vitest";
import { runnerWindowAt } from "./open-mic-status";

describe("runnerWindowAt", () => {
  const night = { runnerOpensAt: 1_000, runnerClosesAt: 5_000 };

  test.each([
    [999, "before"],
    [1_000, "open"],
    [5_000, "open"],
    [5_001, "after"],
  ] as const)("at %i the runner is %s", (now, expected) => {
    expect(runnerWindowAt(night, now)).toBe(expected);
  });
});

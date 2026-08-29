import { describe, expect, it } from "vitest";
import { normalizeCrewLineLabel } from "./normalizeCrewLineLabel";

describe("normalizeCrewLineLabel", () => {
  it("collapses duplicated assignee names", () => {
    expect(normalizeCrewLineLabel("Damian Luciano Muschamp (Damian Luciano Muschamp (Lead))")).toBe(
      "Damian Luciano Muschamp (Lead)",
    );
    expect(
      normalizeCrewLineLabel("Setup — Damian Luciano Muschamp (Damian Luciano Muschamp (Lead))"),
    ).toBe("Setup — Damian Luciano Muschamp (Lead)");
  });

  it("leaves distinct role + assignee labels alone", () => {
    expect(normalizeCrewLineLabel("Sound (Damian (Lead))")).toBe("Sound (Damian (Lead))");
  });
});

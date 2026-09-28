import { describe, expect, it } from "vitest";
import { eventGroupKind } from "./eventGroups";

describe("eventGroupKind", () => {
  it("defaults rows without a kind to recurring", () => {
    expect(eventGroupKind({})).toBe("recurring");
  });

  it("returns an explicit kind unchanged", () => {
    expect(eventGroupKind({ kind: "multi_day" })).toBe("multi_day");
    expect(eventGroupKind({ kind: "recurring" })).toBe("recurring");
  });
});

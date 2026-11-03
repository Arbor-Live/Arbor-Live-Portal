import { describe, expect, it } from "vitest";
import { uniqueBandMemberNames } from "./bandMembers";

describe("uniqueBandMemberNames", () => {
  it("drops a contact who is also listed as a member", () => {
    expect(
      uniqueBandMemberNames(["Colin Skinner", "Colin Skinner", "Natalia Linn"]),
    ).toEqual(["Colin Skinner", "Natalia Linn"]);
  });

  it("ignores case, spacing and blanks, keeping the first spelling", () => {
    expect(
      uniqueBandMemberNames(["Arjun Hausner", " arjun  hausner ", "", undefined, "Aaron Hausner"]),
    ).toEqual(["Arjun Hausner", "Aaron Hausner"]);
  });
});

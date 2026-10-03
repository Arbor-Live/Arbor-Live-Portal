import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { type AdoptablePosition, pickPositionForLine } from "./artistLineSync";

function slot(id: string, partial: Partial<AdoptablePosition> = {}): AdoptablePosition {
  return { needId: id as Id<"eventArtistNeeds">, sortOrder: 0, ...partial };
}

describe("pickPositionForLine", () => {
  const bill = [
    slot("headliner", { label: "Headliner", sortOrder: 1 }),
    slot("support", { label: "Support", sortOrder: 2 }),
    slot("seated", { label: "Opener", seatedOrganizationId: "org-a", sortOrder: 0 }),
  ];

  it("takes the position its act already holds", () => {
    expect(pickPositionForLine({ label: "Act A", organizationId: "org-a" }, bill, true)?.needId).toBe(
      "seated",
    );
  });

  it("takes an empty position with the same name", () => {
    expect(pickPositionForLine({ label: " support " }, bill, true)?.needId).toBe("support");
  });

  it("never takes a position another act holds by name", () => {
    expect(pickPositionForLine({ label: "Opener" }, bill, true)).toBeUndefined();
    expect(pickPositionForLine({ label: "Opener" }, bill, false)?.needId).toBe("headliner");
  });

  it("matches a TBD line to an outside act by name", () => {
    const outside = [slot("ext", { externalArtistName: "The Foos" })];
    expect(pickPositionForLine({ label: "the foos" }, outside, true)?.needId).toBe("ext");
    expect(pickPositionForLine({ label: "the foos", organizationId: "org-b" }, outside, true)).toBeUndefined();
  });

  it("falls back to the first empty position on the bill", () => {
    expect(pickPositionForLine({ label: "TBD artist" }, bill, true)).toBeUndefined();
    expect(pickPositionForLine({ label: "TBD artist" }, bill, false)?.needId).toBe("headliner");
  });

  it("finds nothing when every position is filled", () => {
    expect(pickPositionForLine({ label: "TBD artist" }, [bill[2]!], false)).toBeUndefined();
  });
});

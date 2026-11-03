import { describe, expect, it } from "vitest";
import { carryServerSummaryBlock } from "./event-notes-merge";

const block = "Client email summary (quote approved Nov 3, 2026)\n- Dock after 3pm";

describe("carryServerSummaryBlock", () => {
  it("adds a new server block to an edited draft and rebases onto the server text", () => {
    expect(
      carryServerSummaryBlock({
        draft: "Staff note, edited",
        baseline: "Staff note",
        server: `Staff note\n\n${block}`,
      }),
    ).toEqual({
      draft: `Staff note, edited\n\n${block}`,
      baseline: `Staff note\n\n${block}`,
    });
  });

  it("replaces the block the draft already carries", () => {
    const next = "Client email summary (quote approved Dec 1, 2026)\n- Doors at 7pm";
    expect(
      carryServerSummaryBlock({
        draft: `Edited\n\n${block}`,
        baseline: `Original\n\n${block}`,
        server: `Original\n\n${next}`,
      }),
    ).toEqual({ draft: `Edited\n\n${next}`, baseline: `Original\n\n${next}` });
  });

  it("does nothing when the server block is unchanged or absent", () => {
    expect(
      carryServerSummaryBlock({ draft: "Edited", baseline: `A\n\n${block}`, server: `B\n\n${block}` }),
    ).toBeNull();
    expect(carryServerSummaryBlock({ draft: "Edited", baseline: "A", server: "B" })).toBeNull();
  });
});

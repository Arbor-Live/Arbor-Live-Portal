import { describe, expect, it } from "vitest";
import {
  emailSummaryLabelDate,
  readEmailSummaryBlock,
  renderEmailSummaryBlock,
  upsertEmailSummaryBlock,
} from "./emailSummaryBlock";

const first = renderEmailSummaryBlock("quote approved Nov 3, 2026", [
  "Load-in through the Lagunita lot after 3pm",
  "Podium mic for the opening speeches",
]);

describe("email summary block", () => {
  it("renders the stable first line and one bullet per line", () => {
    expect(first).toBe(
      [
        "Client email summary (quote approved Nov 3, 2026)",
        "- Load-in through the Lagunita lot after 3pm",
        "- Podium mic for the opening speeches",
      ].join("\n"),
    );
  });

  it("formats the label date in Pacific", () => {
    // 2026-11-04T03:00Z is still Nov 3 in Pacific.
    expect(emailSummaryLabelDate(Date.UTC(2026, 10, 4, 3))).toBe("Nov 3, 2026");
  });

  it("is the whole note when there is no staff text", () => {
    expect(upsertEmailSummaryBlock(undefined, first)).toBe(first);
    expect(upsertEmailSummaryBlock("  \n", first)).toBe(first);
  });

  it("appends after staff text", () => {
    expect(upsertEmailSummaryBlock("Call Maya on arrival.\n", first)).toBe(
      `Call Maya on arrival.\n\n${first}`,
    );
  });

  it("replaces the block in place and leaves staff text before and after intact", () => {
    const second = renderEmailSummaryBlock("quote approved Dec 1, 2026", ["Doors move to 7pm"]);
    const notes = `Staff intro line\n\n${first}\n\nStaff outro:\n- not part of the block`;
    expect(upsertEmailSummaryBlock(notes, second)).toBe(
      `Staff intro line\n\n${second}\n\nStaff outro:\n- not part of the block`,
    );
  });

  it("never leaves two blocks after repeated writes", () => {
    const again = upsertEmailSummaryBlock(upsertEmailSummaryBlock("Notes", first), first);
    expect(again.match(/Client email summary/g)).toHaveLength(1);
  });

  it("reads the block back", () => {
    expect(readEmailSummaryBlock(`Hi\n\n${first}\n\nBye`)).toBe(first);
    expect(readEmailSummaryBlock("Just staff text")).toBeNull();
    expect(readEmailSummaryBlock(undefined)).toBeNull();
  });
});

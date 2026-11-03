import { describe, expect, it } from "vitest";
import {
  findEmailSummaryBlocks,
  renderEmailSummaryBlock,
  writeEmailSummaryBlock,
} from "./emailSummaryBlock";

const first = renderEmailSummaryBlock({
  invoiceNumber: "ALINV-0042",
  label: "quote approved Nov 3, 2026",
  bullets: ["Load-in through the Lagunita lot after 3pm", "Podium mic for the opening speeches"],
});
const second = renderEmailSummaryBlock({
  invoiceNumber: "ALINV-0042",
  label: "as of Nov 5, 2026",
  bullets: ["Doors move to 7pm"],
});
const write = (notes: string | undefined, block: string, previous: string | null) =>
  writeEmailSummaryBlock(notes, { invoiceNumber: "ALINV-0042", block, previous });

describe("renderEmailSummaryBlock", () => {
  it("keys the header to the invoice and ends with the end line", () => {
    expect(first).toBe(
      [
        "Client email summary · ALINV-0042 · quote approved Nov 3, 2026",
        "- Load-in through the Lagunita lot after 3pm",
        "- Podium mic for the opening speeches",
        "(end of client email summary)",
      ].join("\n"),
    );
  });
});

describe("findEmailSummaryBlocks", () => {
  it("matches only the exact invoice key", () => {
    const notes = `${first}\n\n${first.replace("ALINV-0042", "ALINV-00421")}`;
    expect(findEmailSummaryBlocks(notes, "ALINV-0042")).toEqual([{ start: 0, end: first.length }]);
    expect(findEmailSummaryBlocks(notes, "ALINV-004")).toEqual([]);
  });

  it("does not count a header with no end line", () => {
    expect(
      findEmailSummaryBlocks("Client email summary · ALINV-0042 · as of Nov 3, 2026\n- a", "ALINV-0042"),
    ).toEqual([]);
  });

  it("does not run a header with no end line into the next block", () => {
    const notes = `Client email summary · ALINV-0042 · typed by staff\n- a\n${first}`;
    const start = notes.indexOf(first);
    expect(findEmailSummaryBlocks(notes, "ALINV-0042")).toEqual([{ start, end: notes.length }]);
  });
});

describe("writeEmailSummaryBlock", () => {
  it("is the whole note when the notes are empty", () => {
    expect(write(undefined, first, null)).toEqual({ notes: first, mode: "appended" });
    expect(write("", first, null)).toEqual({ notes: first, mode: "appended" });
  });

  it("appends after a blank line and leaves staff text byte for byte", () => {
    expect(write("Call Maya on arrival.", first, null).notes).toBe(`Call Maya on arrival.\n\n${first}`);
    expect(write("Call Maya on arrival.\n", first, null).notes).toBe(`Call Maya on arrival.\n\n${first}`);
    expect(write("Call Maya.\n\n", first, null).notes).toBe(`Call Maya.\n\n${first}`);
    expect(write("Call Maya.  ", first, null).notes).toBe(`Call Maya.  \n\n${first}`);
  });

  it("replaces an unchanged block in place", () => {
    const notes = `Staff intro\n\n${first}\n\nStaff outro\n- staff bullet`;
    expect(write(notes, second, first)).toEqual({
      notes: `Staff intro\n\n${second}\n\nStaff outro\n- staff bullet`,
      mode: "replaced",
    });
  });

  it("keeps staff bullets typed right under the block across two runs", () => {
    const staffLines = "- Staff: bring the long XLRs\n- Staff: Sam has the keys";
    const once = write(`${first}\n${staffLines}`, second, first).notes;
    expect(once).toBe(`${second}\n${staffLines}`);
    expect(write(once, first, second).notes).toBe(`${first}\n${staffLines}`);
  });

  it("appends when staff edited inside the block and leaves the edited block alone", () => {
    const edited = first.replace("after 3pm", "after 4pm (Sam confirmed)");
    const notes = `Intro\n\n${edited}\n\nOutro`;
    expect(write(notes, second, first)).toEqual({
      notes: `Intro\n\n${edited}\n\nOutro\n\n${second}`,
      mode: "appended",
    });
  });

  it("appends when staff deleted the block", () => {
    expect(write("Intro only", second, first).notes).toBe(`Intro only\n\n${second}`);
  });

  it("leaves a staff header lookalike and its bullets alone", () => {
    const lookalike =
      "Client email summary · ALINV-0042 · from my call\n- Maya prefers text\n(end of client email summary)";
    expect(write(lookalike, second, first).notes).toBe(`${lookalike}\n\n${second}`);
    expect(write(lookalike, second, null).notes).toBe(`${lookalike}\n\n${second}`);
  });

  it("appends instead of replacing when the end line is missing", () => {
    const headless = first.replace("\n(end of client email summary)", "");
    expect(write(`${headless}\nStaff line`, second, first).notes).toBe(
      `${headless}\nStaff line\n\n${second}`,
    );
  });

  it("keeps two invoices on one event as independent blocks", () => {
    const other = renderEmailSummaryBlock({
      invoiceNumber: "ALINV-0050",
      label: "quote approved Nov 4, 2026",
      bullets: ["Second stage in the courtyard"],
    });
    const notes = `${first}\n\n${other}`;
    expect(write(notes, second, first).notes).toBe(`${second}\n\n${other}`);
    const updatedOther = other.replace("courtyard", "patio");
    expect(
      writeEmailSummaryBlock(notes, { invoiceNumber: "ALINV-0050", block: updatedOther, previous: other })
        .notes,
    ).toBe(`${first}\n\n${updatedOther}`);
  });

  it("works on CRLF notes and writes the block with CRLF", () => {
    const crlf = (text: string) => text.replace(/\n/g, "\r\n");
    const notes = crlf(`Intro\n\n${first}\n\nOutro`);
    expect(write(notes, second, first)).toEqual({
      notes: crlf(`Intro\n\n${second}\n\nOutro`),
      mode: "replaced",
    });
    expect(write("Intro\r\n", second, null).notes).toBe(crlf(`Intro\n\n${second}`));
  });
});

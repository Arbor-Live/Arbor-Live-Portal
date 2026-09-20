import { describe, expect, it } from "vitest";
import { emptyRiderContent } from "./content";
import { renderEventBriefPdfBuffer } from "./render-brief";
import type { EventBriefDocumentData } from "./brief-types";
import type { RiderDocumentData } from "./types";

function baseBrief(overrides: Partial<EventBriefDocumentData> = {}): EventBriefDocumentData {
  return {
    title: "Test Event",
    generatedAtLabel: "Mon, Jan 1, 2026 · 9:00 AM PST",
    statusLabel: "Ready",
    whenLabel: "Sat, Jan 3, 2026 · 6:00 PM – 11:00 PM PST",
    blocks: [{ dayLabel: "Day 1", label: "Setup", timeLabel: "3:00 PM – 5:00 PM" }],
    shifts: [{ role: "Sound", person: "Alex", timeLabel: "3:00 PM – 11:00 PM" }],
    assignments: [{ roleLabel: "Day-of lead", person: "Sam" }],
    contacts: [],
    pullList: [],
    instructions: [{ title: "Load-in", body: "Use the rear dock." }],
    ...overrides,
  };
}

const nightRider: RiderDocumentData = {
  ...emptyRiderContent(),
  bandName: "Test Event",
  riderName: "Band inputs & changeover",
  updatedAtLabel: "Tonight",
  changeovers: [{ title: "Openers → Headliners", lines: ["A.7 Flex1: Sax → Guitar"] }],
};

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString() === "%PDF";
}

describe("event brief PDF", () => {
  it("renders for an event with no bands", async () => {
    const buffer = await renderEventBriefPdfBuffer(baseBrief());
    expect(isPdf(buffer)).toBe(true);
  });

  it("embeds night-rider input/changeover pages when bands exist", async () => {
    const withoutBands = await renderEventBriefPdfBuffer(baseBrief());
    const withBands = await renderEventBriefPdfBuffer(baseBrief({ nightRider }));
    expect(isPdf(withBands)).toBe(true);
    expect(withBands.byteLength).toBeGreaterThan(withoutBands.byteLength);
  });

  it("renders contacts, a pull list, and a scannable brief QR", async () => {
    const buffer = await renderEventBriefPdfBuffer(
      baseBrief({
        briefUrl: "https://arborlive.stanford.edu/dashboard/events/abc123",
        contacts: [
          { roleLabel: "Venue contact", person: "Dana", contact: "dana@example.edu" },
          { roleLabel: "Host contact", person: "Rae Lee", contact: "rae@example.edu · 555-0100" },
          { roleLabel: "Band contact", person: "Jo", contact: "jo@band.test", notes: "The Larks" },
          { roleLabel: "Stage manager", person: "Mina", contact: "mina@example.edu" },
        ],
        pullList: [
          { label: "XLR cable", quantity: 12 },
          { label: "SM58", quantity: 4, notes: "windscreens" },
        ],
      }),
    );
    expect(isPdf(buffer)).toBe(true);
  });
});

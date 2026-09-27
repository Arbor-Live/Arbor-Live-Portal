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
    runOfShow: [
      {
        entries: [
          {
            section: {
              typeLabel: "Setup",
              label: "Setup",
              timeLabel: "3:00 PM – 5:00 PM",
              crew: [{ role: "Sound", person: "Alex", timeLabel: "3:00 PM – 5:00 PM" }],
            },
            moments: [],
          },
        ],
      },
    ],
    acts: [],
    otherShifts: [],
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

  it("renders a multi-day run of show with nested moments, swaps, acts, and open crew", async () => {
    const buffer = await renderEventBriefPdfBuffer(
      baseBrief({
        acts: [
          { name: "The Larks", soundcheckLabel: "5:40 PM – 5:55 PM", setLabel: "6:00 PM – 6:45 PM" },
          { name: "Night Owls", soundcheckLabel: "5:25 PM – 5:40 PM", setLabel: "7:00 PM – 8:00 PM" },
        ],
        runOfShow: [
          {
            dayLabel: "Day 1 · Sat, Jan 3",
            entries: [
              {
                moments: [
                  { typeLabel: "Soundcheck", label: "Night Owls", startLabel: "5:25 PM", durationLabel: "15m" },
                ],
              },
              {
                section: {
                  typeLabel: "Show",
                  label: "Show",
                  timeLabel: "6:00 PM – 11:00 PM",
                  notes: "All ages",
                  crew: [
                    { role: "FOH", person: "Alex", timeLabel: "Call 5:30 PM · 6:00 PM – 11:00 PM" },
                    { role: "Stagehand", person: "Open", timeLabel: "6:00 PM – 11:00 PM", open: true },
                  ],
                },
                moments: [
                  { typeLabel: "Set", label: "The Larks", startLabel: "6:00 PM", durationLabel: "45m" },
                  {
                    typeLabel: "Changeover",
                    label: "Changeover to Night Owls",
                    startLabel: "6:45 PM",
                    durationLabel: "15m",
                    swaps: ["A.7 Flex1: Sax → Guitar"],
                  },
                  { typeLabel: "Set", label: "Night Owls", startLabel: "7:00 PM", durationLabel: "1h" },
                ],
              },
            ],
          },
          { dayLabel: "Day 2 · Sun, Jan 4", entries: [] },
        ],
        otherShifts: [{ role: "Runner", person: "Kai", timeLabel: "4:00 PM – 6:00 PM" }],
        nightRider,
      }),
    );
    expect(isPdf(buffer)).toBe(true);
  });

  it("renders an event with no run of show yet", async () => {
    const buffer = await renderEventBriefPdfBuffer(baseBrief({ runOfShow: [] }));
    expect(isPdf(buffer)).toBe(true);
  });
});

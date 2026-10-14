import { describe, expect, it } from "vitest";
import type { Id } from "@/lib/convex-api";
import { buildCrewRowsFromLinkedEvent, buildCrewRowsFromShifts } from "@/lib/invoice-crew-from-event";

const blockId = "block1" as Id<"eventScheduleBlocks">;
const appId = "app1" as Id<"crewApplications">;

describe("invoice crew rows skip trainees", () => {
  it("from saved event shifts", () => {
    const rows = buildCrewRowsFromLinkedEvent(
      {
        blocks: [{ _id: blockId, label: "Setup", blockType: "setup" }],
        shifts: [
          { scheduleBlockId: blockId, role: "", hours: 3 },
          { scheduleBlockId: blockId, role: "Trainee", personName: "Tia", crewApplicationId: appId, hours: 3 },
        ],
      },
      { openSlotRateUsd: 25 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toContain("Open slot");
  });

  it("from draft shifts", () => {
    const shift = {
      role: "",
      personName: "",
      startsAt: "2026-10-10T14:00",
      endsAt: "2026-10-10T17:00",
      postedToExpense: false,
      notes: "",
    };
    const rows = buildCrewRowsFromShifts(
      [{ id: blockId, label: "Setup", blockType: "setup", startsAt: "2026-10-10T14:00" }],
      [
        { ...shift, scheduleBlockId: blockId },
        { ...shift, scheduleBlockId: blockId, role: "Trainee", personName: "Tia", crewApplicationId: appId },
      ],
      { openSlotRateUsd: 25 },
    );
    expect(rows).toHaveLength(1);
  });
});

describe("invoice crew rows assume the same people stay on", () => {
  const H = 3_600_000;
  const blocks = [
    { _id: "setup" as Id<"eventScheduleBlocks">, label: "Setup", blockType: "setup", startsAt: 0 },
    { _id: "show" as Id<"eventScheduleBlocks">, label: "Show", blockType: "show", startsAt: 2 * H },
    { _id: "strike" as Id<"eventScheduleBlocks">, label: "Strike", blockType: "strike", startsAt: 8 * H },
  ];
  const open = (block: (typeof blocks)[number], hours: number, count: number) =>
    Array.from({ length: count }, () => ({ scheduleBlockId: block._id, role: "Crew", hours, startsAt: block.startsAt }));

  it("2 setup, 2 show, 3 strike over 10 hrs is two people for 10 hrs and one on strike", () => {
    const rows = buildCrewRowsFromLinkedEvent(
      { blocks, shifts: [...open(blocks[0]!, 2, 2), ...open(blocks[1]!, 6, 2), ...open(blocks[2]!, 2, 3)] },
      { openSlotRateUsd: 20 },
    );
    expect(rows.map((row) => [row.label, row.quantity, row.hoursTier])).toEqual([
      ["Setup → Strike — Crew (Open slot)", "8", "regular"],
      ["Setup → Strike — Crew (Open slot)", "2", "past_regular"],
      ["Setup → Strike — Crew (Open slot)", "8", "regular"],
      ["Setup → Strike — Crew (Open slot)", "2", "past_regular"],
      ["Strike — Crew (Open slot)", "2", "regular"],
    ]);
  });

  it("names sections that aren't back to back", () => {
    const rows = buildCrewRowsFromLinkedEvent(
      { blocks, shifts: [...open(blocks[0]!, 2, 1), ...open(blocks[2]!, 2, 1)] },
      { openSlotRateUsd: 20 },
    );
    expect(rows[0]?.label).toBe("Setup + Strike — Crew (Open slot)");
  });

  it("bills each slot's hours at that slot's own stamped rate", () => {
    const draftBlocks = [
      { id: "setup" as Id<"eventScheduleBlocks">, label: "Setup", blockType: "setup" as const, startsAt: "2026-10-10T09:00" },
      { id: "strike" as Id<"eventScheduleBlocks">, label: "Strike", blockType: "strike" as const, startsAt: "2026-10-10T13:00" },
    ];
    const base = { role: "Crew", personName: "", postedToExpense: false, notes: "" };
    const rows = buildCrewRowsFromShifts(draftBlocks, [
      { ...base, scheduleBlockId: draftBlocks[0]!.id, startsAt: "2026-10-10T09:00", endsAt: "2026-10-10T13:00", estimatedHourlyRateUsd: 20 },
      { ...base, scheduleBlockId: draftBlocks[1]!.id, startsAt: "2026-10-10T13:00", endsAt: "2026-10-10T19:00", estimatedHourlyRateUsd: 25 },
    ]);
    expect(rows.map((row) => [row.quantity, row.rateUsd, row.hoursTier])).toEqual([
      ["4", "20", "regular"],
      ["4", "25", "regular"],
      ["2", "25", "past_regular"],
    ]);
  });
});

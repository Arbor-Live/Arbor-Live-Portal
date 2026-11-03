import { describe, expect, it } from "vitest";
import type { Id } from "@/lib/convex-api";
import {
  buildCrewRowsFromLinkedEvent,
  buildCrewRowsFromShifts,
  crewOtherShiftsFromConflicts,
} from "@/lib/invoice-crew-from-event";

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

describe("invoice crew rows count a person's shared time once", () => {
  const H = 3_600_000;
  const seven = Date.UTC(2026, 9, 31, 2); // 7pm Pacific
  const showId = "show" as Id<"eventScheduleBlocks">;
  const strikeId = "strike" as Id<"eventScheduleBlocks">;

  it("bills only the part another event's earlier shift doesn't cover", () => {
    const rows = buildCrewRowsFromLinkedEvent(
      {
        blocks: [{ _id: showId, label: "Show", blockType: "show", startsAt: seven + 0.75 * H }],
        shifts: [
          { _id: "s1" as Id<"eventCrewShifts">, scheduleBlockId: showId, role: "Sound", userId: "u1", personName: "Alex", hours: 1.25, startsAt: seven + 0.75 * H, endsAt: seven + 2 * H, _creationTime: 1 },
        ],
      },
      {
        ratesByUserId: new Map([["u1", { hourlyRateUsd: 20, rateMode: "normal" }]]),
        otherShifts: crewOtherShiftsFromConflicts([
          { userId: "u1", startsAt: seven, endsAt: seven + H, shiftId: "other", shiftCreationTime: 5, hours: 1 },
        ]),
      },
    );
    expect(rows.map((row) => row.quantity)).toEqual(["1"]);
  });

  it("dedupes one person's overlapping sections within the event", () => {
    const base = { role: "Sound", userId: "u1", personName: "Alex" };
    const rows = buildCrewRowsFromLinkedEvent(
      {
        blocks: [
          { _id: showId, label: "Show", blockType: "show", startsAt: seven },
          { _id: strikeId, label: "Strike", blockType: "strike", startsAt: seven + H },
        ],
        shifts: [
          { ...base, _id: "s1" as Id<"eventCrewShifts">, scheduleBlockId: showId, hours: 2, startsAt: seven, endsAt: seven + 2 * H },
          { ...base, _id: "s2" as Id<"eventCrewShifts">, scheduleBlockId: strikeId, hours: 2, startsAt: seven + H, endsAt: seven + 3 * H },
        ],
      },
      { ratesByUserId: new Map([["u1", { hourlyRateUsd: 20, rateMode: "normal" }]]) },
    );
    expect(rows.map((row) => row.quantity)).toEqual(["3"]);
  });

  it("from draft shifts, ignoring a cancelled event's shift", () => {
    const shift = { role: "Sound", userId: "u1", personName: "Alex", postedToExpense: false, notes: "", scheduleBlockId: showId };
    const draft = [{ ...shift, startsAt: "2026-10-30T19:45", endsAt: "2026-10-30T21:00" }];
    const blocks = [{ id: showId, label: "Show", blockType: "show" as const, startsAt: "2026-10-30T19:45" }];
    const other = { id: "o1", userId: "u1", startsAt: seven, endsAt: seven + H, hours: 1 };
    expect(buildCrewRowsFromShifts(blocks, draft, { otherShifts: [other] }).map((row) => row.quantity)).toEqual(["1"]);
    expect(
      buildCrewRowsFromShifts(blocks, draft, { otherShifts: [{ ...other, cancelled: true }] }).map((row) => row.quantity),
    ).toEqual(["1.25"]);
  });
});

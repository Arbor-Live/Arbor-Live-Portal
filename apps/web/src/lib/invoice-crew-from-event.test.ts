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
      [{ id: blockId, label: "Setup", blockType: "setup" }],
      [
        { ...shift, scheduleBlockId: blockId },
        { ...shift, scheduleBlockId: blockId, role: "Trainee", personName: "Tia", crewApplicationId: appId },
      ],
      { openSlotRateUsd: 25 },
    );
    expect(rows).toHaveLength(1);
  });
});

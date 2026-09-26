import { describe, expect, it } from "vitest";
import { resolveTraineePresenceWindow, traineeScheduleSpan } from "./crewTraineeIntro";

const HOUR = 3_600_000;
const showStart = 1_700_000_000_000;
const showEnd = showStart + 4 * HOUR;

describe("resolveTraineePresenceWindow", () => {
  const event = { startAt: showStart, endAt: showEnd };
  const span = traineeScheduleSpan([
    { blockType: "setup", startsAt: showStart - 3 * HOUR, endsAt: showStart },
    { blockType: "show", startsAt: showStart, endsAt: showEnd },
    { blockType: "strike", startsAt: showEnd, endsAt: showEnd + 2 * HOUR },
  ]);

  it("covers setup through strike for the entire event", () => {
    expect(resolveTraineePresenceWindow(event, "entire_event", span)).toEqual({
      startsAt: showStart - 3 * HOUR,
      endsAt: showEnd + 2 * HOUR,
    });
  });

  it("uses the show window when the event has no schedule blocks", () => {
    expect(resolveTraineePresenceWindow(event, "entire_event", traineeScheduleSpan([]))).toEqual({
      startsAt: showStart,
      endsAt: showEnd,
    });
  });

  it("starts the first 8 hours at setup and stops at the show end", () => {
    expect(resolveTraineePresenceWindow(event, "first_8_hours", span)).toEqual({
      startsAt: showStart - 3 * HOUR,
      endsAt: showEnd,
    });
  });

  it("caps the first 8 hours before the show ends", () => {
    const longShowEnd = showStart + 6 * HOUR;
    expect(
      resolveTraineePresenceWindow(
        { startAt: showStart, endAt: longShowEnd },
        "first_8_hours",
        traineeScheduleSpan([
          { blockType: "setup", startsAt: showStart - 3 * HOUR, endsAt: showStart },
          { blockType: "show", startsAt: showStart, endsAt: longShowEnd },
        ]),
      ),
    ).toEqual({
      startsAt: showStart - 3 * HOUR,
      endsAt: showStart + 5 * HOUR,
    });
  });
});

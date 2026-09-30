import { describe, expect, it } from "vitest";
import { responseScheduleChanged, sectionFingerprint } from "./crewAvailability";

const setup = { _id: "setup", blockType: "setup" as const, startsAt: 100, endsAt: 200 };
const show = { _id: "show", blockType: "show" as const, startsAt: 200, endsAt: 300 };
const set = { _id: "set", blockType: "set" as const, startsAt: 210, endsAt: 250 };

describe("sectionFingerprint", () => {
  it("ignores moments and block order", () => {
    expect(sectionFingerprint([show, set, setup])).toBe(sectionFingerprint([setup, show]));
  });
});

describe("responseScheduleChanged", () => {
  it("is false when sections match the snapshot", () => {
    const scheduleFingerprint = sectionFingerprint([setup, show]);
    expect(responseScheduleChanged({ scheduleFingerprint }, [setup, show, set])).toBe(false);
  });

  it("is true when a section moved", () => {
    const scheduleFingerprint = sectionFingerprint([setup, show]);
    expect(
      responseScheduleChanged({ scheduleFingerprint }, [setup, { ...show, endsAt: 400 }]),
    ).toBe(true);
  });

  it("is true when a picked section was deleted, even without a snapshot", () => {
    expect(
      responseScheduleChanged({ partialWindows: [{ scheduleBlockId: "show" }] }, [setup]),
    ).toBe(true);
  });

  it("treats old responses without a snapshot as current", () => {
    expect(responseScheduleChanged({}, [setup, show])).toBe(false);
  });
});

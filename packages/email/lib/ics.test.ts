import { describe, expect, it } from "vitest";
import { buildScheduleIcs } from "./ics";

/**
 * Calendar clients only apply a re-sent invite (same UID) as an update when
 * SEQUENCE increases; without it they add a duplicate event. Guard that the
 * builder emits the caller's sequence and defaults to 0.
 */
describe("buildScheduleIcs SEQUENCE", () => {
  const base = {
    timezone: "America/Los_Angeles",
    organizerEmail: "crew@arbor.st",
    attendeeEmail: "member@example.com",
    event: {
      uid: "crew-event-1-user-1@arbor.st",
      title: "Spring Showcase — Setup",
      startAt: new Date("2026-05-09T16:00:00Z"),
      endAt: new Date("2026-05-09T18:00:00Z"),
    },
  };

  it("emits SEQUENCE:0 when no revision is given", () => {
    const ics = buildScheduleIcs(base);
    expect(ics).toContain("SEQUENCE:0\r\n");
  });

  it("emits the incremented revision for a re-sent invite", () => {
    const ics = buildScheduleIcs({
      ...base,
      event: { ...base.event, sequence: 3 },
    });
    expect(ics).toContain("SEQUENCE:3\r\n");
  });
});

describe("buildScheduleIcs", () => {
  it("emits exactly one VEVENT per invite", () => {
    const ics = buildScheduleIcs({
      timezone: "America/Los_Angeles",
      organizerEmail: "crew@arbor.st",
      attendeeEmail: "member@example.com",
      event: {
        uid: "band-p1-set@arbor.st",
        title: "Set: Spring Showcase",
        startAt: new Date("2026-05-10T04:00:00Z"),
        endAt: new Date("2026-05-10T05:00:00Z"),
      },
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
});

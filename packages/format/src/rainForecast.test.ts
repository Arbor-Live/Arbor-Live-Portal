import { describe, expect, it } from "vitest";
import { dayRain, eventRainRisk, rainFlagText, type RainHour } from "./index";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 10, 14, 8);

function forecast(chances: number[], start = T0): RainHour[] {
  return chances.map((chance, i) => ({
    startMs: start + i * HOUR,
    endMs: start + (i + 1) * HOUR,
    chance,
  }));
}

const at = (hourOffset: number) => T0 + hourOffset * HOUR;
const block = (blockType: string, from: number, to: number) => ({
  blockType,
  startsAt: at(from),
  endsAt: at(to),
});

const NOW = at(-1);

describe("dayRain", () => {
  it("takes the highest chance among the hours that start on that Pacific day", () => {
    const hours = forecast([10, 45, 20, 5]);
    expect(dayRain(hours, "2026-11-14")).toEqual({ chance: 45, peakAt: at(1) });
  });

  it("is undefined beyond the forecast horizon and before the forecast loads", () => {
    expect(dayRain(forecast([40]), "2026-11-20")).toBeUndefined();
    expect(dayRain(undefined, "2026-11-14")).toBeUndefined();
  });

  it("buckets by Pacific day, not UTC", () => {
    const lateEvening = Date.UTC(2026, 10, 15, 6);
    const hours = forecast([70], lateEvening);
    expect(dayRain(hours, "2026-11-14")?.chance).toBe(70);
    expect(dayRain(hours, "2026-11-15")).toBeUndefined();
  });
});

describe("eventRainRisk", () => {
  const hours = forecast([0, 0, 0, 0, 35, 61, 20, 0, 0, 0]);

  it("flags setup and strike at any venue", () => {
    const event = {
      startAt: at(4),
      endAt: at(6),
      venueKind: "indoor",
      blocks: [block("setup", 4, 6), block("show", 7, 8), block("strike", 5, 6)],
    };
    const risk = eventRainRisk(event, hours, NOW);
    expect(risk?.phases.map((p) => [p.phase, p.chance])).toEqual([
      ["setup", 61],
      ["strike", 61],
    ]);
    expect(risk?.outdoor).toBe(false);
  });

  it("counts show blocks only at outdoor venues", () => {
    const blocks = [block("show", 4, 6)];
    const base = { startAt: at(4), endAt: at(6), blocks };
    expect(eventRainRisk({ ...base, venueKind: "outdoor" }, hours, NOW)?.phases[0]).toMatchObject({
      phase: "show",
      chance: 61,
      peakAt: at(5),
    });
    expect(eventRainRisk({ ...base, venueKind: "indoor" }, hours, NOW)).toBeNull();
    expect(eventRainRisk({ ...base, venueKind: "building" }, hours, NOW)).toBeNull();
    expect(eventRainRisk(base, hours, NOW)).toBeNull();
  });

  it("treats every non-setup, non-strike block type as the show", () => {
    const event = {
      startAt: at(4),
      endAt: at(6),
      venueKind: "outdoor",
      blocks: [block("soundcheck", 4, 5)],
    };
    expect(eventRainRisk(event, hours, NOW)?.phases[0]).toMatchObject({ phase: "show", chance: 35 });
  });

  it("uses startAt to endAt as the show when an event has no blocks", () => {
    const event = { startAt: at(5), endAt: at(6), venueKind: "outdoor" };
    expect(eventRainRisk(event, hours, NOW)?.phases[0]).toMatchObject({
      phase: "show",
      startsAt: at(5),
      endsAt: at(6),
      chance: 61,
    });
    expect(eventRainRisk({ ...event, blocks: [] }, hours, NOW)?.chance).toBe(61);
  });

  it("flags a phase only when an overlapping hour reaches 30", () => {
    const event = { startAt: at(6), endAt: at(8), venueKind: "outdoor", blocks: [block("show", 6, 8)] };
    expect(eventRainRisk(event, hours, NOW)).toBeNull();
    const edge = forecast([29, 30]);
    const outdoor = { startAt: at(0), endAt: at(1), venueKind: "outdoor" };
    expect(eventRainRisk(outdoor, edge, NOW)).toBeNull();
    expect(eventRainRisk({ ...outdoor, endAt: at(2) }, edge, NOW)?.chance).toBe(30);
  });

  it("ignores rainy hours that do not overlap a block", () => {
    const event = {
      startAt: at(7),
      endAt: at(9),
      venueKind: "outdoor",
      blocks: [block("show", 7, 9)],
    };
    expect(eventRainRisk(event, hours, NOW)).toBeNull();
    expect(dayRain(hours, "2026-11-14")?.chance).toBe(61);
  });

  it("merges blocks of one phase into a single entry with the max chance", () => {
    const event = {
      startAt: at(0),
      endAt: at(8),
      venueKind: "outdoor",
      blocks: [block("show", 4, 5), block("show", 5, 6), block("setup", 0, 1)],
    };
    const risk = eventRainRisk(event, hours, NOW);
    expect(risk?.phases).toEqual([
      { phase: "show", startsAt: at(4), endsAt: at(6), chance: 61, peakAt: at(5) },
    ]);
    expect(risk?.chance).toBe(61);
  });

  it("returns null for events that already ended", () => {
    const event = { startAt: at(4), endAt: at(6), venueKind: "outdoor", blocks: [block("show", 4, 6)] };
    expect(eventRainRisk(event, hours, at(6) + 1)).toBeNull();
    expect(eventRainRisk(event, hours, at(5))?.chance).toBe(61);
  });

  it("returns null for events entirely after the forecast's last hour", () => {
    const event = { startAt: at(20), endAt: at(22), venueKind: "outdoor", blocks: [block("show", 20, 22)] };
    expect(eventRainRisk(event, hours, NOW)).toBeNull();
  });

  it("returns null when there is no forecast", () => {
    const event = { startAt: at(4), endAt: at(6), venueKind: "outdoor" };
    expect(eventRainRisk(event, undefined, NOW)).toBeNull();
    expect(eventRainRisk(event, [], NOW)).toBeNull();
  });
});

describe("rainFlagText", () => {
  it("lists each phase with its chance", () => {
    expect(
      rainFlagText([
        { phase: "setup", chance: 61 },
        { phase: "strike", chance: 41 },
      ]),
    ).toBe("Rain · Setup 61% · Strike 41%");
  });
});

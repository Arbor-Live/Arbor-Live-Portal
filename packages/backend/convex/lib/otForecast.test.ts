import { pacificDateTimeInputToMs } from "@arbor/format";
import { describe, expect, it } from "vitest";
import { forecastOt } from "./otForecast";

function at(input: string) {
  const ms = pacificDateTimeInputToMs(input);
  if (ms == null) throw new Error(input);
  return ms;
}

function shift(start: string, end: string) {
  return { startsAt: at(start), endsAt: at(end) };
}

function saved(start: string, hours: number) {
  return { startsAt: at(start), hours };
}

describe("forecastOt", () => {
  it("ignores a long day elsewhere in the pay period", () => {
    const forecast = forecastOt(
      [saved("2026-10-01T13:30", 5), saved("2026-10-01T17:00", 6.75)],
      [shift("2026-10-08T17:00", "2026-10-08T20:00")],
    );
    expect(forecast.hasOt).toBe(false);
    expect(forecast.hasDt).toBe(false);
  });

  it("flags the event's day when other shifts push it past 8h", () => {
    const forecast = forecastOt(
      [saved("2026-10-08T09:00", 6)],
      [shift("2026-10-08T17:00", "2026-10-08T20:00")],
    );
    expect(forecast.otDays).toEqual([{ dayKey: "2026-10-08", hours: 9 }]);
  });

  it("flags double time past 12h on the event's day", () => {
    const forecast = forecastOt(
      [],
      [shift("2026-10-08T08:00", "2026-10-08T14:00"), shift("2026-10-08T14:00", "2026-10-08T21:00")],
    );
    expect(forecast.dtDays).toEqual([{ dayKey: "2026-10-08", hours: 13 }]);
  });

  it("flags a workweek over 40h that includes the event", () => {
    const forecast = forecastOt(
      [
        saved("2026-10-05T09:00", 8),
        saved("2026-10-06T09:00", 8),
        saved("2026-10-07T09:00", 8),
        saved("2026-10-09T09:00", 8),
        // Next Monday is a different workweek.
        saved("2026-10-12T09:00", 8),
      ],
      [shift("2026-10-08T09:00", "2026-10-08T17:30")],
    );
    expect(forecast.otDays).toEqual([{ dayKey: "2026-10-08", hours: 8.5 }]);
    expect(forecast.otWeeks).toEqual([{ weekKey: "2026-W41", hours: 40.5 }]);
  });
});

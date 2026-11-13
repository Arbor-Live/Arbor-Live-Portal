import type { RainHour } from "@arbor/format";

export type ParsedForecast = { ok: true; hours: RainHour[] } | { ok: false; reason: string };

function fail(reason: string): ParsedForecast {
  return { ok: false, reason };
}

/** NWS `forecast/hourly` GeoJSON into rain hours. Any malformed period rejects the whole payload. */
export function parseNwsHourly(body: unknown): ParsedForecast {
  const periods = (body as { properties?: { periods?: unknown } } | null)?.properties?.periods;
  if (!Array.isArray(periods)) return fail("missing properties.periods");
  if (periods.length === 0) return fail("properties.periods is empty");

  const hours: RainHour[] = [];
  for (const [index, period] of periods.entries()) {
    const row = period as {
      startTime?: unknown;
      endTime?: unknown;
      probabilityOfPrecipitation?: { value?: unknown } | null;
    } | null;
    const startMs = typeof row?.startTime === "string" ? Date.parse(row.startTime) : NaN;
    const endMs = typeof row?.endTime === "string" ? Date.parse(row.endTime) : NaN;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return fail(`period ${index} has no valid startTime/endTime`);
    }
    const value = row?.probabilityOfPrecipitation?.value ?? 0;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      return fail(`period ${index} has probabilityOfPrecipitation ${JSON.stringify(value)}, expected 0-100 or null`);
    }
    hours.push({ startMs, endMs, chance: value });
  }
  return { ok: true, hours };
}

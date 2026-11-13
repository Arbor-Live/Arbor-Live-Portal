// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { parseNwsHourly } from "./lib/nwsForecast";
import { createUser, makeTest, type Test } from "./test/setup.helpers";

const HOUR = 3_600_000;
const SOURCE = "nws_stanford";

afterEach(() => {
  vi.unstubAllGlobals();
});

function hourGrid(rain: Record<number, number>, count = 36) {
  const start = Math.floor(Date.now() / HOUR) * HOUR;
  return Array.from({ length: count }, (_, i) => ({
    startMs: start + i * HOUR,
    endMs: start + (i + 1) * HOUR,
    chance: rain[i] ?? 0,
  }));
}

const inHours = (n: number) => Math.floor(Date.now() / HOUR) * HOUR + n * HOUR;

async function seedWorld(
  t: Test,
  opts: { venueKind: "outdoor" | "indoor" | "building"; sameUser?: boolean; status?: string; setupInHours?: number },
) {
  const manager = await createUser(t);
  const lead = opts.sameUser ? manager : await createUser(t);
  const setupAt = opts.setupInHours ?? 6;
  const eventId = await t.run(async (ctx) => {
    const now = Date.now();
    const venueId = await ctx.db.insert("venues", {
      name: "Main Quad",
      path: "Main Quad",
      kind: opts.venueKind,
      venueType: "Quad",
      createdAt: now,
      updatedAt: now,
    });
    const id = await ctx.db.insert("events", {
      title: "Frost Fest",
      status: (opts.status ?? "ready") as "ready",
      visibility: "internal",
      startAt: inHours(setupAt + 2),
      endAt: inHours(setupAt + 6),
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      venueId,
      eventManagerUserId: manager._id,
      dayOfLeadUserId: lead._id,
      createdAt: now,
      updatedAt: now,
    });
    for (const [blockType, from, to] of [
      ["setup", setupAt, setupAt + 2],
      ["show", setupAt + 2, setupAt + 6],
    ] as const) {
      await ctx.db.insert("eventScheduleBlocks", {
        eventId: id,
        blockType,
        label: blockType,
        dayIndex: 0,
        startsAt: inHours(from),
        endsAt: inHours(to),
        createdAt: now,
        updatedAt: now,
      });
    }
    return id;
  });
  return { manager, lead, eventId };
}

const store = (t: Test, hours: ReturnType<typeof hourGrid>) =>
  t.mutation(internal.weather.storeForecast, { source: SOURCE, hours });

const rainBells = (t: Test, userId: string) =>
  t.run(async (ctx) =>
    (
      await ctx.db
        .query("notifications")
        .withIndex("by_userId_and_dedupeKey", (q) => q.eq("userId", userId))
        .collect()
    ).filter((row) => row.template === "rain_forecast"),
  );

const alertLevels = (t: Test, eventId: Id<"events">) =>
  t.run(async (ctx) =>
    (
      await ctx.db
        .query("eventRainAlerts")
        .withIndex("by_eventId_and_level", (q) => q.eq("eventId", eventId))
        .collect()
    )
      .map((row) => row.level)
      .sort(),
  );

describe("rain alerts", () => {
  it("notifies the manager and day-of lead once when an outdoor show is at risk", async () => {
    const t = makeTest();
    const { manager, lead, eventId } = await seedWorld(t, { venueKind: "outdoor" });
    await store(t, hourGrid({ 9: 41 }));

    for (const user of [manager, lead]) {
      expect(await rainBells(t, user._id)).toMatchObject([
        {
          title: "Rain forecast: Frost Fest",
          body: "Show 41%",
          path: `/dashboard/events/${eventId}`,
          eventId,
          status: "delivered",
        },
      ]);
    }
    expect(await alertLevels(t, eventId)).toEqual(["chance"]);
  });

  it("sends one notification to a user who is both manager and day-of lead", async () => {
    const t = makeTest();
    const { manager } = await seedWorld(t, { venueKind: "outdoor", sameUser: true });
    await store(t, hourGrid({ 9: 41 }));
    expect(await rainBells(t, manager._id)).toHaveLength(1);
  });

  it("stays quiet for rain during an indoor show and alerts for rain during setup", async () => {
    const t = makeTest();
    const { manager, eventId } = await seedWorld(t, { venueKind: "indoor" });
    await store(t, hourGrid({ 9: 80 }));
    expect(await rainBells(t, manager._id)).toHaveLength(0);
    expect(await alertLevels(t, eventId)).toEqual([]);

    await store(t, hourGrid({ 6: 35 }));
    expect(await rainBells(t, manager._id)).toMatchObject([{ body: "Setup 35%" }]);
  });

  it("sends nothing new when the check runs again", async () => {
    const t = makeTest();
    const { manager, lead } = await seedWorld(t, { venueKind: "outdoor" });
    await store(t, hourGrid({ 9: 41 }));
    await store(t, hourGrid({ 9: 41 }));
    await store(t, hourGrid({ 9: 35 }));
    expect(await rainBells(t, manager._id)).toHaveLength(1);
    expect(await rainBells(t, lead._id)).toHaveLength(1);
  });

  it("sends exactly one more when the chance reaches 60, then nothing", async () => {
    const t = makeTest();
    const { manager, lead, eventId } = await seedWorld(t, { venueKind: "outdoor" });
    await store(t, hourGrid({ 9: 41 }));
    await store(t, hourGrid({ 9: 65 }));
    await store(t, hourGrid({ 9: 90 }));
    await store(t, hourGrid({ 9: 20 }));
    await store(t, hourGrid({ 9: 70 }));

    for (const user of [manager, lead]) {
      const rows = await rainBells(t, user._id);
      expect(rows.map((row) => row.body)).toEqual(expect.arrayContaining(["Show 41%", "Show 65%"]));
      expect(rows).toHaveLength(2);
    }
    expect(await alertLevels(t, eventId)).toEqual(["chance", "likely"]);
  });

  it("sends only the likely message when both levels are crossed at once", async () => {
    const t = makeTest();
    const { manager, eventId } = await seedWorld(t, { venueKind: "outdoor" });
    await store(t, hourGrid({ 9: 75 }));
    await store(t, hourGrid({ 9: 75 }));
    expect(await rainBells(t, manager._id)).toMatchObject([{ body: "Show 75%" }]);
    expect(await alertLevels(t, eventId)).toEqual(["chance", "likely"]);
  });

  it("ignores cancelled events and events whose setup is more than 48 hours away", async () => {
    const t = makeTest();
    const cancelled = await seedWorld(t, { venueKind: "outdoor", status: "cancelled" });
    const far = await seedWorld(t, { venueKind: "outdoor", setupInHours: 60 });
    await store(t, hourGrid({ 9: 80, 63: 80, 64: 80, 65: 80 }, 100));
    expect(await rainBells(t, cancelled.manager._id)).toHaveLength(0);
    expect(await rainBells(t, far.manager._id)).toHaveLength(0);
  });
});

describe("forecast storage", () => {
  const stubFetch = (response: Response | Error) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (response instanceof Error) throw response;
        return response;
      }),
    );

  const storedRow = (t: Test) =>
    t.run(async (ctx) =>
      ctx.db
        .query("weatherForecasts")
        .withIndex("by_source", (q) => q.eq("source", SOURCE))
        .unique(),
    );

  const nwsBody = (chance: number | null) => ({
    properties: {
      periods: [
        {
          startTime: "2026-11-14T09:00:00-08:00",
          endTime: "2026-11-14T10:00:00-08:00",
          probabilityOfPrecipitation: { unitCode: "wmoUnit:percent", value: chance },
        },
      ],
    },
  });

  it("stores a good payload, sends a generic user agent, and upserts", async () => {
    const t = makeTest();
    stubFetch(Response.json(nwsBody(40)));
    await t.action(internal.weather.refresh, {});
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.weather.gov/gridpoints/MTR/90,88/forecast/hourly");
    expect(fetchMock.mock.calls[0]![1]!.headers).toEqual({
      Accept: "application/geo+json",
      "User-Agent": "event-ops-weather (weather alerts)",
    });
    expect((await storedRow(t))?.hours).toEqual([
      { startMs: Date.parse("2026-11-14T09:00:00-08:00"), endMs: Date.parse("2026-11-14T10:00:00-08:00"), chance: 40 },
    ]);

    stubFetch(Response.json(nwsBody(null)));
    await t.action(internal.weather.refresh, {});
    const rows = await t.run(async (ctx) => ctx.db.query("weatherForecasts").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hours[0]!.chance).toBe(0);
  });

  it("keeps the last good forecast when the fetch fails or the payload is invalid", async () => {
    const t = makeTest();
    await store(t, hourGrid({ 2: 50 }, 4));
    const before = await storedRow(t);

    const failures: Array<Response | Error> = [
      new Response("unavailable", { status: 503 }),
      new Error("network down"),
      new Response("<html>not json</html>", { status: 200 }),
      Response.json({ properties: {} }),
      Response.json({ properties: { periods: [] } }),
      Response.json({
        properties: { periods: [{ startTime: "nope", endTime: "x", probabilityOfPrecipitation: { value: 10 } }] },
      }),
      Response.json(nwsBody(250)),
    ];
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const failure of failures) {
      stubFetch(failure);
      await expect(t.action(internal.weather.refresh, {})).resolves.toBeNull();
      expect(await storedRow(t)).toEqual(before);
    }
  });
});

describe("parseNwsHourly", () => {
  it("names what is wrong with a rejected payload", () => {
    expect(parseNwsHourly(null)).toEqual({ ok: false, reason: "missing properties.periods" });
    expect(parseNwsHourly({ properties: { periods: [] } })).toEqual({
      ok: false,
      reason: "properties.periods is empty",
    });
    const result = parseNwsHourly({
      properties: {
        periods: [{ startTime: "2026-11-14T09:00:00-08:00", endTime: "2026-11-14T10:00:00-08:00", probabilityOfPrecipitation: { value: "high" } }],
      },
    });
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.reason).toContain("period 0");
  });

  it("rejects a period whose probability container is malformed instead of reading it as dry", () => {
    const period = { startTime: "2026-11-14T09:00:00-08:00", endTime: "2026-11-14T10:00:00-08:00" };
    for (const probabilityOfPrecipitation of ["invalid", {}, undefined]) {
      const result = parseNwsHourly({ properties: { periods: [{ ...period, probabilityOfPrecipitation }] } });
      expect(result).toEqual({ ok: false, reason: "period 0 has no probabilityOfPrecipitation.value" });
    }
    expect(
      parseNwsHourly({ properties: { periods: [{ ...period, probabilityOfPrecipitation: { value: null } }] } }),
    ).toMatchObject({ ok: true, hours: [{ chance: 0 }] });
  });
});

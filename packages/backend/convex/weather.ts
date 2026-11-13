import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { parseNwsHourly } from "./lib/nwsForecast";
import { sendRainAlerts } from "./lib/rainAlerts";

const SOURCE = "nws_stanford";
/** NWS Bay Area office (MTR) grid cell covering Stanford's main campus. */
const NWS_HOURLY_URL = "https://api.weather.gov/gridpoints/MTR/90,88/forecast/hourly";

const rainHoursValidator = v.array(
  v.object({ startMs: v.number(), endMs: v.number(), chance: v.number() }),
);

export const refresh = internalAction({
  args: {},
  handler: async (ctx) => {
    let response: Response;
    try {
      response = await fetch(NWS_HOURLY_URL, {
        headers: {
          Accept: "application/geo+json",
          "User-Agent": "event-ops-weather (weather alerts)",
        },
      });
    } catch (error) {
      console.error("NWS forecast fetch failed; keeping the last forecast", error);
      return null;
    }
    if (!response.ok) {
      console.error(`NWS forecast responded ${response.status}; keeping the last forecast`);
      return null;
    }
    const parsed = parseNwsHourly(await response.json().catch(() => null));
    if (!parsed.ok) {
      console.error(`NWS forecast payload rejected (${parsed.reason}); keeping the last forecast`);
      return null;
    }
    await ctx.runMutation(internal.weather.storeForecast, { source: SOURCE, hours: parsed.hours });
    return null;
  },
});

export const storeForecast = internalMutation({
  args: { source: v.string(), hours: rainHoursValidator },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("weatherForecasts")
      .withIndex("by_source", (q) => q.eq("source", args.source))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { hours: args.hours, fetchedAt: now });
    } else {
      await ctx.db.insert("weatherForecasts", { source: args.source, hours: args.hours, fetchedAt: now });
    }
    await sendRainAlerts(ctx, args.hours, now);
    return null;
  },
});

/** The stored hours as of the last good fetch; null before the first one. */
export const forecastHours = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const row = await ctx.db
      .query("weatherForecasts")
      .withIndex("by_source", (q) => q.eq("source", SOURCE))
      .unique();
    return row ? row.hours : null;
  },
});

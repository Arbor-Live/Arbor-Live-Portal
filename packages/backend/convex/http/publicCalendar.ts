import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { buildPublicCalendar } from "../lib/publicCalendar";

const CALENDAR_NAME = "Arbor Live Events";

/**
 * Public, subscribable ICS feed of upcoming public events.
 *
 * One stable URL that Google/Apple Calendar poll on their own schedule, so
 * students get every Arbor show without re-adding anything as the season moves.
 * Only public, non-cancelled events are included, and only the show window,
 * venue, map link, and event page travel — no internal detail.
 */
export const handlePublicCalendar = httpAction(async (ctx) => {
  const events = await ctx.runQuery(internal.publicCalendar.getFeedEvents, {
    now: Date.now(),
  });

  const ics = buildPublicCalendar({
    events,
    calendarName: CALENDAR_NAME,
    refreshInterval: "PT1H",
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Let the calendar client cache; `X-PUBLISHED-TTL` also hints refresh.
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": 'inline; filename="arbor-live.ics"',
      "Access-Control-Allow-Origin": "*",
    },
  });
});

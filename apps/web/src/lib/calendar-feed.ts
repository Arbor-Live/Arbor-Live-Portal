/**
 * Fetch + validate the public ICS feed from the Convex deployment.
 *
 * Kept out of the route handler so it can be unit-tested without Next's module
 * aliases, and so the route stays a thin HTTP shell.
 */

export const CALENDAR_FEED_PATH = "/events/calendar.ics";

const UPSTREAM_TIMEOUT_MS = 10_000;

export type CalendarFeedResult =
  | { ok: true; body: string }
  | { ok: false; status: 502; message: string };

const UNAVAILABLE =
  "The calendar feed is temporarily unavailable. Please try again shortly.";

export async function fetchCalendarFeed(convexSiteUrl: string): Promise<CalendarFeedResult> {
  const upstreamUrl = `${convexSiteUrl.replace(/\/$/, "")}/calendar.ics`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { Accept: "text/calendar" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[calendar] Failed to reach the Convex feed", {
      upstreamUrl,
      error: message,
    });
    return { ok: false, status: 502, message: UNAVAILABLE };
  }

  if (!upstream.ok) {
    console.error("[calendar] Convex feed returned a non-OK status", {
      upstreamUrl,
      status: upstream.status,
    });
    return { ok: false, status: 502, message: UNAVAILABLE };
  }

  const body = await upstream.text();
  if (!body.trimStart().startsWith("BEGIN:VCALENDAR")) {
    console.error("[calendar] Convex feed returned a non-ICS body", { upstreamUrl });
    return {
      ok: false,
      status: 502,
      message: "The calendar feed returned an unexpected response.",
    };
  }

  return { ok: true, body };
}

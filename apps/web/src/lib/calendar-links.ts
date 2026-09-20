/**
 * Provider hand-off URLs for subscribing to the public events ICS feed.
 *
 * Pure functions so the exact URL shapes are unit-tested — these are easy to
 * get subtly wrong (encoding, param names, protocol) and fail silently.
 *
 * Provider behavior, as of writing:
 *  - Google: `calendar/render?cid=<feed>` opens "add calendar from URL".
 *  - Apple: browsers cannot subscribe to an ICS URL, so `webcal://` hands the
 *    feed to the native Calendar app. This must be a direct link, not a
 *    redirect page. `webcal://` is the right protocol *here*.
 *  - Outlook: Stanford accounts are Microsoft 365, so the `outlook.office.com`
 *    host is the correct one. The web "Subscribe from web" flow requires an
 *    `https://` URL (not `webcal://`, despite older write-ups).
 */

export const CALENDAR_FEED_PATH = "/events/calendar.ics";

const OUTLOOK_CALENDAR_NAME = "Arbor Live Events";

export type CalendarProviderLinks = {
  google: string;
  apple: string;
  /** Microsoft 365 (Stanford) accounts. */
  outlook: string;
};

export function buildCalendarProviderLinks(feedUrl: string): CalendarProviderLinks {
  const encoded = encodeURIComponent(feedUrl);
  const webcal = feedUrl.replace(/^https?:\/\//, "webcal://");
  const name = encodeURIComponent(OUTLOOK_CALENDAR_NAME);

  return {
    google: `https://calendar.google.com/calendar/render?cid=${encoded}`,
    apple: webcal,
    outlook: `https://outlook.office.com/calendar/0/addfromweb?url=${encoded}&name=${name}`,
  };
}

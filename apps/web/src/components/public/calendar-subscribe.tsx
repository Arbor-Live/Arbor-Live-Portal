"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  CALENDAR_FEED_PATH,
  buildCalendarProviderLinks,
} from "@/lib/calendar-links";

/**
 * Shareable subscription link for the public events calendar. The URL is a
 * stable ICS feed served from our own domain, so pasting it into a calendar app
 * keeps a student's calendar in sync as new shows are added.
 *
 * Providers differ in how they accept a feed:
 *  - Google / Outlook open a web "add from URL" flow.
 *  - Apple has no web flow; `webcal://` hands off to the native Calendar app,
 *    which is why that button is a direct link rather than a redirect page.
 */

const emptySubscribe = () => () => {};

export function CalendarSubscribe({ className }: { className?: string }) {
  const info = useQuery(api.publicCalendar.getFeedInfo, {});
  const [copied, setCopied] = useState(false);

  // Read the current origin without a mount effect (avoids hydration mismatch):
  // server snapshot is "" and the client subscribes to the real value.
  const origin = useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => "",
  );

  const path = info?.feedPath ?? CALENDAR_FEED_PATH;
  const feedUrl = origin ? `${origin}${path}` : path;
  const links = buildCalendarProviderLinks(feedUrl);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      notify.success("Calendar link copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error("Could not copy. Select the link and copy it manually.");
    }
  }, [feedUrl]);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm">
          <a href={links.google} target="_blank" rel="noreferrer">
            Google Calendar
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={links.apple}>Apple Calendar</a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={links.outlook} target="_blank" rel="noreferrer">
            Outlook
          </a>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void handleCopy()}>
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p className="mt-2 break-all text-xs text-muted-foreground">{feedUrl}</p>
    </div>
  );
}

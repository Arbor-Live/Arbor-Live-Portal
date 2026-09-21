"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { notify } from "@/lib/notify";
import {
  CALENDAR_FEED_PATH,
  buildCalendarProviderLinks,
} from "@/lib/calendar-links";

/**
 * Shareable subscription options for the public events calendar. The URL is a
 * stable ICS feed on our own domain, so a student's calendar stays in sync as
 * new shows are added.
 *
 * Providers differ in how they accept a feed:
 *  - Google / Outlook open a web "add from URL" flow.
 *  - Apple has no web flow; `webcal://` hands off to the native Calendar app,
 *    which is why that link is direct rather than a redirect page.
 */

const emptySubscribe = () => () => {};

const PROVIDERS = [
  { key: "google", label: "Google" },
  { key: "apple", label: "Apple" },
  { key: "outlook", label: "Outlook" },
] as const;

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
  // Server-rendered HTML has no origin, so a link built from the relative path
  // would be actionable-but-wrong before hydration. Defer the links until the
  // client origin is known.
  const ready = Boolean(origin);

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
      {PROVIDERS.map((provider) =>
        ready ? (
          <a
            key={provider.key}
            href={links[provider.key]}
            {...(provider.key === "apple"
              ? {}
              : { target: "_blank", rel: "noreferrer" })}
            className="text-sm font-medium text-status-emerald-800 underline-offset-4 hover:underline dark:text-primary"
          >
            {provider.label}
          </a>
        ) : (
          <span key={provider.key} className="text-sm font-medium text-muted-foreground">
            {provider.label}
          </span>
        ),
      )}
      <button
        type="button"
        onClick={() => void handleCopy()}
        disabled={!ready}
        className="text-sm font-medium text-status-emerald-800 underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline dark:text-primary"
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}

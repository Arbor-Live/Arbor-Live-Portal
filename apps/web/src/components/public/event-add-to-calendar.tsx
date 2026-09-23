"use client";

import { useSyncExternalStore } from "react";
import {
  buildEventCalendarProviderLinks,
  eventCalendarIcsPath,
  type EventCalendarInput,
} from "@/lib/event-calendar";

const emptySubscribe = () => () => {};

const PROVIDERS = [
  { key: "google", label: "Google" },
  { key: "apple", label: "Apple" },
  { key: "outlook", label: "Outlook" },
] as const;

/**
 * Add-this-show links. Google opens a template; Apple uses webcal against the
 * per-event ICS; Outlook opens the same ICS over https.
 */
export function EventAddToCalendar({
  event,
  className,
}: {
  event: EventCalendarInput;
  className?: string;
}) {
  const origin = useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => "",
  );

  const path = eventCalendarIcsPath(event.eventId);
  const icsUrl = origin ? `${origin}${path}` : path;
  const links = buildEventCalendarProviderLinks(event, icsUrl);
  const ready = Boolean(origin);

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
    </div>
  );
}

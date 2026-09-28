"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChatCircleIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TYPE_OPTIONS } from "@/components/events/lineup/lineup-model";
import { getEventEditorTabPath } from "@/lib/event-editor-tabs";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

const RANGES = {
  "14": { label: "2 weeks", days: 14 },
  "30": { label: "30 days", days: 30 },
  "90": { label: "90 days", days: 90 },
  all: { label: "All upcoming", days: Number.POSITIVE_INFINITY },
} as const;
type RangeKey = keyof typeof RANGES;

const TYPE_LABELS = new Map(TYPE_OPTIONS.map((option) => [option.value, option.label]));

/** Days until the show: red inside a week, amber inside three. */
function countdown(startAt: number, now: number) {
  const days = Math.max(0, Math.ceil((startAt - now) / DAY_MS));
  const label = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  const tone =
    days < 7
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : days < 21
        ? "border-status-amber-500/40 bg-status-amber-500/10 text-status-amber-700 dark:text-status-amber-300"
        : "border-border text-muted-foreground";
  return { label, tone };
}

/**
 * Logistics view: every upcoming position no act fills yet, grouped by event
 * and soonest first, each linking to its side panel on the event's Lineup.
 */
export function OpenPositionsBoard() {
  const result = useQuery(api.eventArtistNeeds.listOpenPositions, {});
  const events = result?.events;
  const [range, setRange] = useState<RangeKey>("30");
  const [search, setSearch] = useState("");
  const [now] = useState(() => Date.now());

  const visible = useMemo(() => {
    if (!events) return [];
    const until = now + RANGES[range].days * DAY_MS;
    const needles = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return events.flatMap((event) => {
      if (event.startAt > until) return [];
      const positions = event.openPositions.filter((position) => {
        if (needles.length === 0) return true;
        const haystack = [
          event.title,
          event.venueName,
          position.label,
          position.genres,
          TYPE_LABELS.get(position.artistType),
        ]
          .join(" ")
          .toLowerCase();
        return needles.every((needle) => haystack.includes(needle));
      });
      // Filled is counted before search narrows the open positions.
      const filled = event.totalPositions - event.openPositions.length;
      return positions.length ? [{ ...event, filled, openPositions: positions }] : [];
    });
  }, [events, now, range, search]);

  const openCount = visible.reduce((total, event) => total + event.openPositions.length, 0);
  const withInquiries = visible.reduce(
    (total, event) => total + event.openPositions.filter((position) => position.inquiryCount > 0).length,
    0,
  );

  return (
    <div className="space-y-4" data-testid="open-positions">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={range}
          onValueChange={(value) => value && setRange(value as RangeKey)}
          aria-label="Date range"
        >
          {(Object.keys(RANGES) as RangeKey[]).map((key) => (
            <ToggleGroupItem key={key} value={key}>
              {RANGES[key].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search events, venues, genres"
            aria-label="Search open positions"
            className="pl-8"
          />
        </div>
      </div>

      {events === undefined ? (
        <p className="text-sm text-muted-foreground">Loading open positions…</p>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="open-positions-summary">
          {openCount === 0
            ? "Every position in this range is filled."
            : `${openCount} open position${openCount === 1 ? "" : "s"} across ${visible.length} event${
                visible.length === 1 ? "" : "s"
              }${withInquiries ? ` · ${withInquiries} with inquiries to review` : ""}`}
        </p>
      )}
      {result?.truncated ? (
        <p className="text-sm text-status-amber-700 dark:text-status-amber-300">
          Not every upcoming event could be checked, so some open positions may be missing from this
          list.
        </p>
      ) : null}

      <div className="space-y-3">
        {visible.map((event) => {
          const due = countdown(event.startAt, now);
          const filled = event.filled;
          const lineupPath = getEventEditorTabPath(event.eventId, "artists");
          return (
            <section key={event.eventId} className="border" data-testid="open-positions-event">
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-muted/20 px-3 py-2">
                <span className="w-28 shrink-0 text-sm font-semibold tabular-nums">
                  {formatDate(event.startAt)}
                </span>
                <span className={cn("shrink-0 border px-1.5 py-0.5 text-2xs font-semibold uppercase", due.tone)}>
                  {due.label}
                </span>
                <Link href={lineupPath} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {event.title}
                  {event.venueName ? (
                    <span className="font-normal text-muted-foreground"> · {event.venueName}</span>
                  ) : null}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {filled} of {event.totalPositions} filled
                </span>
              </header>
              <ul className="divide-y border-t">
                {event.openPositions.map((position) => (
                  <li
                    key={position.needId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                  >
                    <span className="w-28 shrink-0 text-sm text-muted-foreground tabular-nums">
                      {position.setStartsAt != null
                        ? `${formatTime(position.setStartsAt)}${
                            position.setEndsAt != null ? ` – ${formatTime(position.setEndsAt)}` : ""
                          }`
                        : "No set time"}
                    </span>
                    <div className="min-w-40 flex-1">
                      <p className="truncate text-sm font-medium">{position.label || "Unnamed position"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[TYPE_LABELS.get(position.artistType), position.genres].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {position.inquiryCount > 0 ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-status-emerald-700 dark:text-status-emerald-300">
                        <ChatCircleIcon className="size-3.5" />
                        {position.inquiryCount} inquir{position.inquiryCount === 1 ? "y" : "ies"}
                      </span>
                    ) : null}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`${lineupPath}?position=${position.needId}`}>Fill</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

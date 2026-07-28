"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CaretLeftIcon,
  CaretRightIcon,
  MapPinIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normalizeEventStatus, formatEventStatusLabel } from "@/lib/event-status";
import {
  PORTAL_TIMEZONE,
  pacificDateKey,
  pacificEndOfDayMs,
  pacificStartOfDayMs,
} from "@/lib/format";

type DashboardEvent = {
  _id: string;
  title: string;
  status: string;
  eventType?: string;
  venueName?: string;
  teamsInterested?: string[];
  assignedCrewCount?: number;
  startAt: number;
  endAt: number;
  scheduleSummary?: {
    setupAt?: number;
    showAt?: number;
    strikeAt?: number;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
const VISIBLE_WEEKS = 4;
const VISIBLE_DAYS = VISIBLE_WEEKS * DAYS_PER_WEEK;

function dateKeyParts(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

function addPacificDays(dateKey: string, days: number) {
  const { year, month, day } = dateKeyParts(dateKey);
  const noon = pacificStartOfDayMs(year, month, day) + 12 * 60 * 60 * 1000;
  return pacificDateKey(noon + days * DAY_MS);
}

function enumeratePacificDayKeys(startMs: number, endMs: number) {
  const startKey = pacificDateKey(startMs);
  const endKey = pacificDateKey(Math.max(startMs, endMs));
  const keys: string[] = [];
  let cursor = startKey;
  for (let i = 0; i < 400; i += 1) {
    keys.push(cursor);
    if (cursor === endKey) break;
    cursor = addPacificDays(cursor, 1);
  }
  return keys;
}

function weekStartKeyFromAnchor(anchorMs: number) {
  // Monday-start week in Pacific (matches FullCalendar firstDay={1}).
  const key = pacificDateKey(anchorMs);
  const { year, month, day } = dateKeyParts(key);
  const noon = pacificStartOfDayMs(year, month, day) + 12 * 60 * 60 * 1000;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    weekday: "short",
  }).format(new Date(noon));
  const mondayOffset: Record<string, number> = {
    Mon: 0,
    Tue: -1,
    Wed: -2,
    Thu: -3,
    Fri: -4,
    Sat: -5,
    Sun: -6,
  };
  return addPacificDays(key, mondayOffset[weekday] ?? 0);
}

function dayHeaderLabel(dateKey: string, todayKey: string) {
  const { year, month, day } = dateKeyParts(dateKey);
  const noon = pacificStartOfDayMs(year, month, day) + 12 * 60 * 60 * 1000;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    weekday: "short",
  }).format(new Date(noon));
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    month: "short",
  }).format(new Date(noon));
  const isFirstOfMonth = day === 1;
  const isToday = dateKey === todayKey;
  return {
    weekday,
    day,
    monthLabel: isFirstOfMonth || dateKey.endsWith("-01") ? monthLabel : null,
    isToday,
    title: new Intl.DateTimeFormat("en-US", {
      timeZone: PORTAL_TIMEZONE,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(noon)),
  };
}

function formatBoardTime(ms: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function formatBoardRange(startAt: number, endAt: number) {
  const sameDay = pacificDateKey(startAt) === pacificDateKey(endAt);
  if (sameDay) {
    return `${formatBoardTime(startAt)} → ${formatBoardTime(endAt)}`;
  }
  const startDay = new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    month: "short",
    day: "numeric",
  }).format(new Date(startAt));
  const endDay = new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    month: "short",
    day: "numeric",
  }).format(new Date(endAt));
  return `${startDay} ${formatBoardTime(startAt)} → ${endDay} ${formatBoardTime(endAt)}`;
}

function eventTypeAccent(eventType?: string) {
  if (eventType === "Dry Hire" || eventType === "Dry Rental") {
    return "border-l-amber-600 bg-amber-500/10";
  }
  if (eventType === "Rental with Crew") {
    return "border-l-sky-600 bg-sky-500/10";
  }
  if (eventType === "Services Only") {
    return "border-l-violet-600 bg-violet-500/10";
  }
  if (eventType === "Crewed Event") {
    return "border-l-emerald-600 bg-emerald-500/10";
  }
  return "border-l-primary bg-muted/40";
}

function eventTypeDot(eventType?: string) {
  if (eventType === "Dry Hire" || eventType === "Dry Rental") return "bg-amber-600";
  if (eventType === "Rental with Crew") return "bg-sky-600";
  if (eventType === "Services Only") return "bg-violet-600";
  if (eventType === "Crewed Event") return "bg-emerald-600";
  return "bg-primary";
}

function teamTagClass(team: string) {
  switch (team) {
    case "Lighting":
      return "bg-slate-500/15 text-slate-700 dark:text-slate-200";
    case "Sound":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
    case "Design":
      return "bg-rose-500/15 text-rose-800 dark:text-rose-200";
    case "Marketing":
      return "bg-orange-500/15 text-orange-800 dark:text-orange-200";
    case "Operations":
      return "bg-blue-500/15 text-blue-800 dark:text-blue-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function EventBoardCard({
  event,
  compact,
}: {
  event: DashboardEvent;
  compact?: boolean;
}) {
  const status = normalizeEventStatus(event.status);
  const tags = [
    event.eventType,
    ...(event.teamsInterested ?? []).slice(0, 3),
  ].filter(Boolean) as string[];

  return (
    <Link
      href={`/dashboard/events/${event._id}`}
      className={cn(
        "block rounded-md border border-border border-l-[3px] p-2.5 shadow-sm transition-colors hover:bg-accent/40",
        eventTypeAccent(event.eventType),
        compact ? "min-h-[4.5rem]" : "min-h-[5.5rem]",
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-1 size-2.5 shrink-0 rounded-[3px]", eventTypeDot(event.eventType))} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug text-foreground">{event.title}</p>
            <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatBoardTime(event.scheduleSummary?.showAt ?? event.startAt)}
            </p>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {formatBoardRange(event.startAt, event.endAt)}
          </p>
          {event.venueName ? (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPinIcon className="size-3 shrink-0" />
              <span className="truncate">{event.venueName}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1 pt-0.5">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
              {formatEventStatusLabel(status)}
            </span>
            {tags.map((tag) => (
              <span
                key={`${event._id}-${tag}`}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  event.eventType === tag
                    ? "bg-background/80 text-foreground ring-1 ring-border"
                    : teamTagClass(tag),
                )}
              >
                {tag}
              </span>
            ))}
            {(event.assignedCrewCount ?? 0) > 0 ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {event.assignedCrewCount} crew
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

function packSpanLanes(
  spans: Array<{ event: DashboardEvent; startCol: number; endCol: number }>,
) {
  const lanes: Array<Array<{ event: DashboardEvent; startCol: number; endCol: number }>> = [];
  for (const span of spans) {
    let placed = false;
    for (const lane of lanes) {
      const overlaps = lane.some(
        (other) => span.startCol <= other.endCol && span.endCol >= other.startCol,
      );
      if (!overlaps) {
        lane.push(span);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([span]);
  }
  return lanes;
}

function formatWeekRangeLabel(weekDayKeys: string[]) {
  const startParts = dateKeyParts(weekDayKeys[0]);
  const endParts = dateKeyParts(weekDayKeys[DAYS_PER_WEEK - 1]);
  const startNoon =
    pacificStartOfDayMs(startParts.year, startParts.month, startParts.day) + 12 * 60 * 60 * 1000;
  const endNoon =
    pacificStartOfDayMs(endParts.year, endParts.month, endParts.day) + 12 * 60 * 60 * 1000;
  const startMonth = new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    month: "short",
  }).format(new Date(startNoon));
  const endMonth = new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    month: "short",
  }).format(new Date(endNoon));
  if (startMonth === endMonth) {
    return `${startMonth} ${startParts.day} – ${endParts.day}`;
  }
  return `${startMonth} ${startParts.day} – ${endMonth} ${endParts.day}`;
}

export function EventsBoardView({ events }: { events: DashboardEvent[] }) {
  const [now] = useState(() => Date.now());
  const todayKey = pacificDateKey(now);
  const [weekAnchorKey, setWeekAnchorKey] = useState(() => weekStartKeyFromAnchor(now));

  const dayKeys = useMemo(
    () => Array.from({ length: VISIBLE_DAYS }, (_, index) => addPacificDays(weekAnchorKey, index)),
    [weekAnchorKey],
  );

  const weekRows = useMemo(() => {
    return Array.from({ length: VISIBLE_WEEKS }, (_, weekIndex) => {
      const start = weekIndex * DAYS_PER_WEEK;
      return dayKeys.slice(start, start + DAYS_PER_WEEK);
    });
  }, [dayKeys]);

  const rangeStartMs = useMemo(() => {
    const { year, month, day } = dateKeyParts(dayKeys[0]);
    return pacificStartOfDayMs(year, month, day);
  }, [dayKeys]);

  const rangeEndMs = useMemo(() => {
    const last = dayKeys[dayKeys.length - 1];
    const { year, month, day } = dateKeyParts(last);
    return pacificEndOfDayMs(year, month, day);
  }, [dayKeys]);

  const weeks = useMemo(() => {
    const visible = events
      .filter((event) => event.endAt >= rangeStartMs && event.startAt <= rangeEndMs)
      .sort((a, b) => a.startAt - b.startAt);

    return weekRows.map((weekDayKeys) => {
      const spanning: Array<{
        event: DashboardEvent;
        startCol: number;
        endCol: number;
      }> = [];
      const byDay = new Map<string, DashboardEvent[]>();
      for (const key of weekDayKeys) byDay.set(key, []);

      for (const event of visible) {
        const eventDays = enumeratePacificDayKeys(event.startAt, event.endAt);
        const daysInWeek = eventDays.filter((key) => weekDayKeys.includes(key));
        if (!daysInWeek.length) continue;

        const startCol = weekDayKeys.indexOf(daysInWeek[0]) + 1;
        const endCol = weekDayKeys.indexOf(daysInWeek[daysInWeek.length - 1]) + 1;

        if (endCol > startCol) {
          spanning.push({ event, startCol, endCol });
        } else {
          byDay.get(daysInWeek[0])?.push(event);
        }
      }

      spanning.sort((a, b) => {
        if (a.startCol !== b.startCol) return a.startCol - b.startCol;
        return a.event.startAt - b.event.startAt;
      });

      return {
        weekDayKeys,
        spanLanes: packSpanLanes(spanning),
        byDay,
      };
    });
  }, [events, weekRows, rangeStartMs, rangeEndMs]);

  const rangeLabel = useMemo(() => {
    const startParts = dateKeyParts(dayKeys[0]);
    const endParts = dateKeyParts(dayKeys[dayKeys.length - 1]);
    const startMonth = new Intl.DateTimeFormat("en-US", {
      timeZone: PORTAL_TIMEZONE,
      month: "short",
    }).format(new Date(rangeStartMs + 12 * 60 * 60 * 1000));
    const endMonth = new Intl.DateTimeFormat("en-US", {
      timeZone: PORTAL_TIMEZONE,
      month: "short",
    }).format(new Date(rangeEndMs));
    if (startParts.year !== endParts.year) {
      return `${startMonth} ${startParts.day}, ${startParts.year} – ${endMonth} ${endParts.day}, ${endParts.year}`;
    }
    if (startMonth === endMonth) {
      return `${startMonth} ${startParts.day} – ${endParts.day}, ${endParts.year}`;
    }
    return `${startMonth} ${startParts.day} – ${endMonth} ${endParts.day}, ${endParts.year}`;
  }, [dayKeys, rangeStartMs, rangeEndMs]);

  const weekGridStyle = {
    display: "grid" as const,
    gridTemplateColumns: `repeat(${DAYS_PER_WEEK}, minmax(140px, 1fr))`,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeekAnchorKey((key) => addPacificDays(key, -VISIBLE_DAYS))}
            aria-label="Previous 4 weeks"
          >
            <CaretLeftIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeekAnchorKey(weekStartKeyFromAnchor(Date.now()))}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeekAnchorKey((key) => addPacificDays(key, VISIBLE_DAYS))}
            aria-label="Next 4 weeks"
          >
            <CaretRightIcon className="size-4" />
          </Button>
        </div>
        <p className="text-sm font-medium">{rangeLabel}</p>
        <p className="text-xs text-muted-foreground">{VISIBLE_WEEKS} weeks</p>
      </div>

      <div className="space-y-4">
        {weeks.map(({ weekDayKeys, spanLanes, byDay }, weekIndex) => (
          <div key={`week-${weekDayKeys[0]}`} className="overflow-x-auto rounded-md border bg-card">
            <div className="border-b bg-muted/30 px-3 py-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Week {weekIndex + 1}
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                {formatWeekRangeLabel(weekDayKeys)}
              </p>
            </div>

            <div className="min-w-[980px]" style={weekGridStyle}>
              {weekDayKeys.map((key) => {
                const header = dayHeaderLabel(key, todayKey);
                return (
                  <div
                    key={`header-${key}`}
                    className={cn(
                      "flex items-center justify-between gap-2 border-b border-r px-2 py-2 last:border-r-0",
                      header.isToday ? "bg-primary/10" : "bg-muted/40",
                    )}
                    title={header.title}
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {header.weekday}
                        {header.monthLabel ? ` · ${header.monthLabel}` : ""}
                      </p>
                      <p
                        className={cn(
                          "text-lg font-semibold tabular-nums leading-none",
                          header.isToday && "text-primary",
                        )}
                      >
                        {header.day}
                      </p>
                    </div>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      title={`Create event on ${header.title}`}
                    >
                      <Link href={`/dashboard/events/new?date=${key}`}>
                        <PlusIcon className="size-4" />
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>

            {spanLanes.length > 0 ? (
              <div className="min-w-[980px] space-y-1 border-b px-1 py-2">
                {spanLanes.map((lane, laneIndex) => (
                  <div key={`lane-${weekDayKeys[0]}-${laneIndex}`} style={weekGridStyle} className="gap-x-2">
                    {lane.map(({ event, startCol, endCol }) => (
                      <div
                        key={`span-${event._id}`}
                        style={{ gridColumn: `${startCol} / ${endCol + 1}` }}
                      >
                        <EventBoardCard event={event} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="min-w-[980px]" style={weekGridStyle}>
              {weekDayKeys.map((key) => {
                const dayEvents = byDay.get(key) ?? [];
                const header = dayHeaderLabel(key, todayKey);
                return (
                  <div
                    key={`col-${key}`}
                    className={cn(
                      "min-h-[14rem] space-y-2 border-r p-2 last:border-r-0",
                      header.isToday && "bg-primary/[0.03]",
                    )}
                  >
                    {dayEvents.length === 0 ? (
                      <p className="px-1 pt-2 text-[11px] text-muted-foreground">No events</p>
                    ) : (
                      dayEvents.map((event) => (
                        <EventBoardCard key={event._id} event={event} compact />
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

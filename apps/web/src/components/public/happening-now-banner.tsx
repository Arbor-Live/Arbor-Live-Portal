"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/convex-api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type HappeningNowEvent = NonNullable<
  FunctionReturnType<typeof api.publicEvents.listHappeningNow>
>[number];

/** How often the client re-checks its local clock against the candidate list.
 *  Pure client work — the server subscription is stable and never re-polls. */
const RECHECK_MS = 60_000;
const MAX_SHOWN = 3;

export function useHappeningNowEvents(): HappeningNowEvent[] {
  // Candidates (±window around server time) arrive over a stable subscription;
  // the exact "is it happening right now" filter runs locally on a ticking clock.
  const candidates = useQuery(api.publicEvents.listHappeningNow, {});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), RECHECK_MS);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(
    () => (candidates ?? []).filter((event) => event.startAt <= now && now < event.endAt),
    [candidates, now],
  );
}

export function HappeningNowBar({ events }: { events: HappeningNowEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  if (events.length === 0) return null;
  const shown = events.slice(0, MAX_SHOWN);
  const expandable = events.length > 1;
  const labelClassName =
    "flex shrink-0 items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]";

  // Visible slots are breakpoint-based (1 mobile / 2 sm / 3 lg) — the "+N more"
  // counts reflect what each breakpoint hides. On mobile the inline links are
  // capped at one, so the label doubles as a toggle revealing every live event
  // with its time; desktop keeps the plain label and inline links.
  const liveDot = (
    <span className="relative flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-white" />
    </span>
  );

  return (
    <div>
      <div className="flex h-8 items-center gap-x-2 overflow-hidden bg-emerald-600 px-3 text-white sm:h-9 sm:gap-x-3 sm:px-4">
        {expandable ? (
          <>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-controls="happening-now-list"
              className={cn(labelClassName, "underline-offset-2 hover:underline sm:hidden")}
            >
              {liveDot}
              Happening right now
              <CaretDownIcon
                className={cn("size-3 transition-transform", expanded && "rotate-180")}
              />
            </button>
            <span className={cn(labelClassName, "hidden sm:flex")}>
              {liveDot}
              Happening right now
            </span>
          </>
        ) : (
          <span className={labelClassName}>
            {liveDot}
            Happening right now
          </span>
        )}
        <span className="ml-auto flex min-w-0 items-center gap-x-2 truncate text-xs sm:text-sm">
          {shown.map((event, index) => (
            <span
              key={event.eventId}
              className={cn(
                "min-w-0 items-center gap-x-2",
                index === 0 ? "flex" : index === 1 ? "hidden sm:flex" : "hidden lg:flex",
              )}
            >
              {index > 0 ? <span className="shrink-0 opacity-60">·</span> : null}
              <Link
                href={event.publicEventUrl}
                className="truncate font-medium underline-offset-2 hover:underline"
              >
                {event.title}
              </Link>
            </span>
          ))}
          {events.length > 1 ? (
            <span className="shrink-0 opacity-90 sm:hidden">+{events.length - 1} more</span>
          ) : null}
          {events.length > 2 ? (
            <span className="hidden shrink-0 opacity-90 sm:inline lg:hidden">
              +{events.length - 2} more
            </span>
          ) : null}
          {events.length > 3 ? (
            <span className="hidden shrink-0 opacity-90 lg:inline">+{events.length - 3} more</span>
          ) : null}
        </span>
      </div>
      {expanded && expandable ? (
        <ul
          id="happening-now-list"
          className="border-t border-white/25 bg-emerald-600 text-white sm:hidden"
        >
          {events.map((event) => (
            <li key={event.eventId}>
              <Link
                href={event.publicEventUrl}
                onClick={() => setExpanded(false)}
                className="flex flex-col gap-0.5 px-3 py-2 hover:bg-white/10 sm:px-4"
              >
                <span className="truncate text-sm font-medium">{event.title}</span>
                <span className="text-xs opacity-80">{formatDateTime(event.startAt, "short")}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
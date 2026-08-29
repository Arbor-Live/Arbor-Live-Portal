"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/convex-api";
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
  if (events.length === 0) return null;
  const shown = events.slice(0, MAX_SHOWN);

  // Visible slots are breakpoint-based (1 mobile / 2 sm / 3 lg), so each
  // breakpoint gets its own "+N more" count for the events it hides.
  return (
    <div className="flex h-8 items-center gap-x-2 overflow-hidden bg-emerald-600 px-3 text-white sm:h-9 sm:gap-x-3 sm:px-4">
      <span className="flex shrink-0 items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-white" />
        </span>
        Happening right now
      </span>
      <span className="flex min-w-0 items-center gap-x-2 truncate text-xs sm:text-sm">
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
  );
}
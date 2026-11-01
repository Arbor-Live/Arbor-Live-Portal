"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { MapPinIcon } from "@phosphor-icons/react";
import { RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { Button } from "@/components/ui/button";
import { api, type Id } from "@/lib/convex-api";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const MINUTE_MS = 60_000;

type ActiveShift = {
  eventId: Id<"events">;
  title: string;
  venueName?: string;
  startsAt: number;
  endsAt: number;
  phase: "upcoming" | "now" | "ended";
};

const PHASES: Record<ActiveShift["phase"], { label: string; card: string; status: string }> = {
  now: {
    label: "On shift now",
    card: "border-status-emerald-500/40 bg-status-emerald-500/10",
    status: "text-status-emerald-700 dark:text-status-emerald-200",
  },
  upcoming: {
    label: "Shift starts soon",
    card: "border-status-blue-500/40 bg-status-blue-500/10",
    status: "text-status-blue-700 dark:text-status-blue-200",
  },
  ended: {
    label: "Shift just ended",
    card: "border-border bg-card",
    status: "text-muted-foreground",
  },
};

function shiftTimes({ startsAt, endsAt }: ActiveShift) {
  return `${formatTime(startsAt)} to ${formatTime(endsAt)}`;
}

/**
 * The viewer's active shifts. A new `now` makes `useQuery` return undefined
 * until the server answers, so the last answer is held to keep the card from
 * blinking off every minute.
 */
export function useActiveShifts() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => window.clearInterval(timer);
  }, []);
  const minute = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  const latest = useQuery(api.crewPortal.listMyActiveShifts, { now: minute });

  const [shifts, setShifts] = useState<ActiveShift[]>();
  if (latest !== undefined && latest !== shifts) setShifts(latest);
  return latest ?? shifts;
}

export function OnShiftCard() {
  const [shift, ...others] = useActiveShifts() ?? [];
  if (!shift) return null;

  const phase = PHASES[shift.phase];
  return (
    <section
      data-testid="home-on-shift-card"
      className={cn("border p-4", phase.card)}
      aria-label={phase.label}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className={cn("text-xs font-semibold tracking-wide uppercase", phase.status)}>
            {phase.label}
          </p>
          <h2 className="text-lg font-semibold break-words">{shift.title}</h2>
          <p className="text-sm tabular-nums">{shiftTimes(shift)}</p>
          {shift.venueName ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPinIcon className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{shift.venueName}</span>
            </p>
          ) : null}
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href={`/dashboard/events/${shift.eventId}`}>Open event</Link>
        </Button>
      </div>
      {others.length > 0 ? (
        <ul className="mt-3 divide-y border-t">
          {others.map((other) => (
            <ListRow
              key={other.eventId}
              className="border-0 px-0"
              href={`/dashboard/events/${other.eventId}`}
              data-testid="home-on-shift-row"
            >
              <RowText
                eyebrow={PHASES[other.phase].label}
                title={other.title}
                detail={shiftTimes(other)}
              />
            </ListRow>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

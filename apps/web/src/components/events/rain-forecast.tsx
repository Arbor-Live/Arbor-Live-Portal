"use client";

import {
  RAIN_CHANCE_THRESHOLD,
  RAIN_PHASE_LABEL,
  dayRain,
  type EventRainRisk,
  type RainHour,
} from "@arbor/format";
import { CloudRainIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PORTAL_TIMEZONE } from "@/lib/format";
import { cn } from "@/lib/utils";

export const RAIN_TONE = "bg-status-sky-500/15 text-status-sky-800 dark:text-status-sky-300";

export function RainDayChip({
  hours,
  dateKey,
  className,
}: {
  hours: RainHour[] | undefined;
  dateKey: string;
  className?: string;
}) {
  const rain = dayRain(hours, dateKey);
  if (!rain || rain.chance < RAIN_CHANCE_THRESHOLD) return null;
  return (
    <span
      className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-2xs whitespace-nowrap tabular-nums", RAIN_TONE, className)}
      data-testid="rain-day-chip"
    >
      Rain {rain.chance}%
    </span>
  );
}

export function RainBlockTag({ chance }: { chance: number | undefined }) {
  if (chance === undefined) return null;
  return (
    <span
      className="mr-1 rounded bg-background/80 px-1 py-px align-middle text-2xs font-medium whitespace-nowrap text-status-sky-800 ring-1 ring-border tabular-nums dark:text-status-sky-300"
      data-testid="rain-event-flag"
    >
      Rain {chance}%
    </span>
  );
}

const clockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PORTAL_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
});

function formatClock(ms: number) {
  return clockFormatter.format(new Date(ms)).replace(":00", "").replace(" ", "").toLowerCase();
}

export function EventRainWarning({ risk }: { risk: EventRainRisk | null }) {
  if (!risk) return null;
  return (
    <Alert data-testid="event-rain-warning">
      <CloudRainIcon className="size-4" />
      <AlertTitle>Rain forecast</AlertTitle>
      <AlertDescription>
        {risk.phases.map((phase) => (
          <p key={phase.phase} className="tabular-nums">
            {RAIN_PHASE_LABEL[phase.phase]} {formatClock(phase.startsAt)}–{formatClock(phase.endsAt)} · {phase.chance}%
          </p>
        ))}
      </AlertDescription>
    </Alert>
  );
}

"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatDate,
  formatDateTime,
  pacificDateKey,
  toPacificDateTimeInput,
} from "@/lib/format";

type TimetableBlock = {
  _id: string;
  blockType: string;
  label: string;
  startsAt: number;
  endsAt: number;
  notes?: string;
};

/** Pixels per hour in the timeline track. */
const HOUR_HEIGHT = 56;

function minutesIntoPacificDay(ms: number) {
  const iso = toPacificDateTimeInput(ms);
  const time = iso.split("T")[1] ?? "00:00";
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function hourLabel(minutes: number) {
  const hour24 = Math.floor(minutes / 60) % 24;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12} ${hour24 < 12 ? "AM" : "PM"}`;
}

const BLOCK_STYLES: Record<string, string> = {
  setup: "border-amber-500/40 bg-amber-500/10",
  show: "border-primary/40 bg-primary/10",
  strike: "border-zinc-400/40 bg-zinc-500/10",
  custom: "border-border bg-muted",
};

/**
 * Read-only day-by-day timetable of an event's schedule blocks. Blocks are
 * positioned by their start/duration within a per-day hour window.
 */
export function PublicEventTimetable({
  blocks,
  title = "Schedule",
}: {
  blocks: TimetableBlock[];
  title?: string;
}) {
  const days = useMemo(() => {
    const byDay = new Map<string, TimetableBlock[]>();
    for (const block of blocks) {
      const key = pacificDateKey(block.startsAt);
      const list = byDay.get(key);
      if (list) list.push(block);
      else byDay.set(key, [block]);
    }

    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, dayBlocks]) => {
        const placed = dayBlocks
          .map((block) => {
            const startMin = minutesIntoPacificDay(block.startsAt);
            const endMin =
              pacificDateKey(block.endsAt) === key
                ? minutesIntoPacificDay(block.endsAt)
                : 1440;
            return { block, startMin, endMin: Math.max(endMin, startMin + 15) };
          })
          .sort((a, b) => a.startMin - b.startMin);

        const minStart = Math.min(...placed.map((entry) => entry.startMin));
        const maxEnd = Math.max(...placed.map((entry) => entry.endMin));
        const windowStart = Math.floor(minStart / 60) * 60;
        const windowEnd = Math.min(1440, Math.ceil(maxEnd / 60) * 60);
        const span = Math.max(windowEnd - windowStart, 60);

        return { key, placed, windowStart, span };
      });
  }, [blocks]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">No schedule blocks added yet.</p>
        ) : null}
        {days.map((day) => {
          const hourCount = day.span / 60;
          const hours = Array.from({ length: hourCount + 1 }, (_, i) => day.windowStart + i * 60);
          return (
            <div key={day.key} className="space-y-3">
              <p className="text-sm font-medium">{formatDate(day.placed[0]!.block.startsAt)}</p>
              <div className="relative pl-14" style={{ height: hourCount * HOUR_HEIGHT }}>
                {hours.map((minutes) => (
                  <div
                    key={minutes}
                    className="absolute right-0 left-14 border-t border-border/50"
                    style={{ top: `${((minutes - day.windowStart) / day.span) * 100}%` }}
                  >
                    <span className="absolute -top-2.5 -left-14 w-12 text-right text-xs text-muted-foreground">
                      {hourLabel(minutes)}
                    </span>
                  </div>
                ))}
                {day.placed.map(({ block, startMin, endMin }) => (
                  <div
                    key={block._id}
                    className={cn(
                      "absolute right-2 left-14 overflow-hidden border px-3 py-1.5",
                      BLOCK_STYLES[block.blockType] ?? BLOCK_STYLES.custom,
                    )}
                    style={{
                      top: `${((startMin - day.windowStart) / day.span) * 100}%`,
                      height: `${((endMin - startMin) / day.span) * 100}%`,
                    }}
                  >
                    <p className="truncate text-sm font-medium">{block.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateTime(block.startsAt, "timeOnly")} –{" "}
                      {formatDateTime(block.endsAt, "timeOnly")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

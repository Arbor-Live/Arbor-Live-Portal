"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  durationLabel,
  MOMENT_ICONS,
  RAIL_STYLES,
  TypeChip,
} from "@/components/events/workspace/run-of-show/run-of-show-styles";
import { blockDraftFromRow, type PersistedBlockRow } from "@/lib/event-schedule-draft";
import { formatDate, formatTime } from "@/lib/format";
import { nestRunOfShow, type TimedBlock } from "@/lib/run-of-show";
import { cn } from "@/lib/utils";

/** An act block's label is "<act> soundcheck" / "<act> set"; the chip already says which. */
function titleOf(moment: TimedBlock) {
  const { block } = moment;
  return block.actOwned ? block.label.replace(/ (soundcheck|set)$/, "") : block.label;
}

function Notes({ notes }: { notes: string }) {
  if (!notes.trim()) return null;
  return <p className="basis-full text-xs whitespace-pre-wrap text-muted-foreground">{notes}</p>;
}

function Moment({ moment, nested }: { moment: TimedBlock; nested: boolean }) {
  const { block, start, end } = moment;
  const Icon = MOMENT_ICONS[block.blockType as keyof typeof MOMENT_ICONS];
  return (
    <li
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pr-3", nested ? "pl-6" : "pl-3")}
      data-block-type={block.blockType}
    >
      <div className="w-18 shrink-0 tabular-nums">
        <p className="text-sm">{formatTime(start)}</p>
        <p className="text-xs text-muted-foreground">{durationLabel(start, end)}</p>
      </div>
      <span className={cn("h-6 w-1 shrink-0", RAIL_STYLES[block.blockType])} aria-hidden />
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
      <TypeChip type={block.blockType} />
      <p className="min-w-0 flex-1 truncate text-sm font-medium">{titleOf(moment)}</p>
      <Notes notes={block.notes} />
    </li>
  );
}

/**
 * Read-only Run of Show: sections with the doors, soundchecks, sets, and
 * changeovers that happen inside them, day by day.
 */
export function RunOfShowView({
  blocks,
  title = "Run of show",
  emptyLabel = "No run of show yet.",
}: {
  blocks: PersistedBlockRow[];
  title?: string;
  emptyLabel?: string;
}) {
  const days = useMemo(() => nestRunOfShow(blocks.map((row) => blockDraftFromRow(row))), [blocks]);
  const multiDay = days.length > 1;

  return (
    <Card data-testid="run-of-show-view">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {days.length === 0 ? <p className="text-sm text-muted-foreground">{emptyLabel}</p> : null}
        {days.map((day) => {
          const first = day.entries[0];
          const dayStart = first ? (first.section?.start ?? first.moments[0]!.start) : null;
          return (
            <div key={day.dayIndex} className="space-y-2">
              {multiDay && dayStart != null ? (
                <p className="text-sm font-medium">
                  Day {day.dayIndex + 1} · {formatDate(dayStart)}
                </p>
              ) : null}
              {day.entries.map((entry) =>
                entry.section ? (
                  <section
                    key={entry.section.block.id}
                    className="border"
                    data-block-type={entry.section.block.blockType}
                  >
                    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-muted/20 px-3 py-2">
                      <div className="w-24 shrink-0 tabular-nums">
                        <p className="text-sm font-semibold">{formatTime(entry.section.start)}</p>
                        <p className="text-xs text-muted-foreground">
                          to {formatTime(entry.section.end)}
                        </p>
                      </div>
                      <span
                        className={cn("h-8 w-1 shrink-0", RAIL_STYLES[entry.section.block.blockType])}
                        aria-hidden
                      />
                      <TypeChip type={entry.section.block.blockType} />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">
                        {entry.section.block.label}
                      </p>
                      <Notes notes={entry.section.block.notes} />
                    </header>
                    {entry.moments.length > 0 ? (
                      <ul className="divide-y border-t">
                        {entry.moments.map((moment) => (
                          <Moment key={moment.block.id} moment={moment} nested />
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ) : (
                  <ul key={entry.moments[0]!.block.id} className="border border-dashed">
                    <Moment moment={entry.moments[0]!} nested={false} />
                  </ul>
                ),
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

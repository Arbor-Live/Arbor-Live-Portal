"use client";

import { RowCell, RowGroup } from "@/components/list-page";
import { formatDate } from "@/lib/format";

type TimecardDay = {
  dateMs: number;
  events: Array<{
    eventId: string;
    title: string;
    actualHours: number;
    inputHours: number;
  }>;
  totalActual: number;
  totalInput: number;
};

export function TimecardDetail({ days }: { days: TimecardDay[] }) {
  if (!days.length) {
    return <p className="text-sm text-muted-foreground">No shifts recorded in this pay period.</p>;
  }

  return (
    <div className="space-y-3" data-testid="timecard-detail">
      <p className="text-xs text-muted-foreground">
        Hours to input are a guide for Stanford — you do not need exact clock times. Log real work
        including prep time as appropriate.
      </p>
      <div className="space-y-4">
        {days.map((day) => (
          <RowGroup
            key={day.dateMs}
            title={formatDate(day.dateMs)}
            count={day.events.length}
            aside={
              <span className="text-xs text-muted-foreground tabular-nums">
                {day.totalInput.toFixed(2)} h to input · {day.totalActual.toFixed(2)} h worked
              </span>
            }
          >
            {day.events.map((event) => (
              <li
                key={`${day.dateMs}-${event.eventId}`}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{event.title}</span>
                <RowCell className="w-28">{event.inputHours.toFixed(2)} h</RowCell>
                <RowCell className="w-20" muted>
                  {event.actualHours.toFixed(2)} h
                </RowCell>
              </li>
            ))}
          </RowGroup>
        ))}
      </div>
    </div>
  );
}

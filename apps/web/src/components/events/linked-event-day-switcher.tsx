"use client";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { Id } from "@/lib/convex-api";

export type LinkedDayOption = {
  _id: Id<"events">;
  title: string;
  startAt: number;
  endAt: number;
  dayNumber?: number;
};

export function LinkedEventDaySwitcher({
  days,
  selectedEventId,
  onSelect,
  className,
}: {
  days: LinkedDayOption[];
  selectedEventId: Id<"events"> | undefined;
  onSelect: (eventId: Id<"events">) => void;
  className?: string;
}) {
  if (days.length < 2) return null;

  return (
    <div className={className} data-testid="linked-event-day-switcher">
      <div className="flex flex-wrap gap-2">
        {days.map((day, index) => {
          const dayNumber = day.dayNumber ?? index + 1;
          const selected = day._id === selectedEventId;
          return (
            <Button
              key={day._id}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              data-testid={`linked-event-day-${dayNumber}`}
              aria-pressed={selected}
              onClick={() => onSelect(day._id)}
            >
              Day {dayNumber}
              <span className="ml-1.5 font-normal opacity-80">{formatDate(day.startAt)}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

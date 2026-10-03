"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      <Select
        value={selectedEventId ?? ""}
        onValueChange={(value) => onSelect(value as Id<"events">)}
      >
        <SelectTrigger className="h-8 w-[220px]" aria-label="Day" data-testid="linked-event-day-trigger">
          <SelectValue placeholder="Select a day" />
        </SelectTrigger>
        <SelectContent>
          {days.map((day, index) => {
            const dayNumber = day.dayNumber ?? index + 1;
            return (
              <SelectItem
                key={day._id}
                value={day._id}
                data-testid={`linked-event-day-${dayNumber}`}
              >
                Day {dayNumber} · {formatDate(day.startAt)}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

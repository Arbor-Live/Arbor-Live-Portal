"use client";

import { useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import {
  BOOKING_DAY_LOAD_LEGEND,
  bookingDayLoadClassName,
  monthDateRange,
  parseDateInput,
  toDateInput,
} from "@/lib/booking-day-load";
import { cn } from "@/lib/utils";

export function BookingAvailabilityCalendar({
  selectedDate,
  highlightedDates = [],
  onSelectDate,
  minDate = new Date(),
}: {
  selectedDate: string;
  highlightedDates?: string[];
  onSelectDate: (dateKey: string) => void;
  minDate?: Date;
}) {
  const selected = useMemo(() => parseDateInput(selectedDate), [selectedDate]);
  const [visibleMonth, setVisibleMonth] = useState(() => selected ?? minDate);
  const { rangeStart, rangeEnd } = useMemo(() => monthDateRange(visibleMonth), [visibleMonth]);
  const dayLoad = useQuery(api.eventRequests.getPublicBookingDayLoad, { rangeStart, rangeEnd });

  return (
    <div className="booking-availability-calendar space-y-3">
      <DatePicker
        inline
        selected={selected}
        onChange={(date: Date | null) => {
          if (!date) return;
          onSelectDate(toDateInput(date));
        }}
        onMonthChange={(date) => setVisibleMonth(date)}
        minDate={minDate}
        calendarClassName="app-date-time-calendar booking-availability-calendar-panel"
        dayClassName={(date) => {
          const dateKey = toDateInput(date);
          const classes = ["booking-availability-day"];
          if (highlightedDates.includes(dateKey)) {
            classes.push("booking-availability-day-highlighted");
          }
          if (selectedDate === dateKey) {
            classes.push("booking-availability-day-selected");
          }
          return classes.join(" ");
        }}
        renderDayContents={(dayOfMonth, date) => {
          const dateKey = toDateInput(date);
          const level = dayLoad?.[dateKey]?.level ?? "free";
          return (
            <span className="booking-availability-day-contents">
              <span>{dayOfMonth}</span>
              <span
                className={cn("booking-day-load-dot", bookingDayLoadClassName(level))}
                aria-hidden
              />
            </span>
          );
        }}
      />

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {BOOKING_DAY_LOAD_LEGEND.map((item) => (
          <span key={item.level} className="inline-flex items-center gap-1.5">
            <span className={cn("booking-day-load-dot", item.className)} aria-hidden />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function getDayLoadLevel(
  dayLoad: Record<string, { count: number; level: "free" | "busy" | "unavailable" }> | undefined,
  dateKey: string,
) {
  return dayLoad?.[dateKey]?.level ?? "free";
}

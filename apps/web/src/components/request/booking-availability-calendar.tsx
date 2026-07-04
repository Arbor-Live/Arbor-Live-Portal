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
    <div className="booking-availability-calendar">
      <div className="booking-availability-calendar-shell">
        <DatePicker
          inline
          selected={selected}
          onChange={(date: Date | null) => {
            if (!date) return;
            onSelectDate(toDateInput(date));
          }}
          onMonthChange={(date) => setVisibleMonth(date)}
          minDate={minDate}
          calendarClassName="booking-availability-calendar-panel"
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
            const isSelected = selectedDate === dateKey;
            return (
              <span className="booking-availability-day-contents">
                <span className="booking-availability-day-number">{dayOfMonth}</span>
                <span
                  className={cn(
                    "booking-day-load-dot",
                    isSelected
                      ? "booking-day-load-dot-selected"
                      : bookingDayLoadClassName(level),
                  )}
                  aria-hidden
                />
              </span>
            );
          }}
        />

        <div className="booking-availability-legend">
          {BOOKING_DAY_LOAD_LEGEND.map((item) => (
            <span key={item.level} className="booking-availability-legend-item">
              <span className={cn("booking-day-load-dot", item.className)} aria-hidden />
              {item.label}
            </span>
          ))}
        </div>
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

import { formatDate, pacificDateAndTimeToMs } from "@/lib/format";

export type BookingDayLoadLevel = "free" | "busy" | "unavailable";

export const BOOKING_DAY_LOAD_LEGEND: Array<{
  level: BookingDayLoadLevel;
  label: string;
  className: string;
}> = [
  { level: "free", label: "Free", className: "booking-day-load-dot-free" },
  { level: "busy", label: "Busy", className: "booking-day-load-dot-busy" },
  {
    level: "unavailable",
    label: "Probably unavailable",
    className: "booking-day-load-dot-unavailable",
  },
];

export function bookingDayLoadClassName(level: BookingDayLoadLevel | undefined) {
  switch (level) {
    case "busy":
      return "booking-day-load-dot-busy";
    case "unavailable":
      return "booking-day-load-dot-unavailable";
    default:
      return "booking-day-load-dot-free";
  }
}

export function toDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD into a Date whose local Y-M-D matches (calendar UI). */
export function parseDateInput(value: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function monthDateRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    rangeStart: toDateInput(start),
    rangeEnd: toDateInput(end),
  };
}

export function formatSelectedDateLabel(dateKey: string) {
  const ms = pacificDateAndTimeToMs(dateKey, "12:00");
  if (ms == null) return dateKey;
  return formatDate(ms);
}

export const UNAVAILABLE_DAY_WARNING =
  "This day already has several events scheduled. We may have limited availability — submit anyway and our team will follow up.";

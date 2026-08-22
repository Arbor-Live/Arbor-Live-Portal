import { formatDate, pacificDateAndTimeToMs, pacificDateKey } from "@/lib/format";

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
  return pacificDateKey(date.getTime());
}

/** Parse YYYY-MM-DD as a Pacific calendar day instant. */
export function parseDateInput(value: string) {
  const ms = pacificDateAndTimeToMs(value, "12:00");
  return ms == null ? null : new Date(ms);
}

export function monthDateRange(date: Date) {
  const key = pacificDateKey(date.getTime());
  const [year, month] = key.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    rangeStart: `${year}-${String(month).padStart(2, "0")}-01`,
    rangeEnd: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function formatSelectedDateLabel(dateKey: string) {
  const ms = pacificDateAndTimeToMs(dateKey, "12:00");
  if (ms == null) return dateKey;
  return formatDate(ms);
}

export const UNAVAILABLE_DAY_WARNING =
  "This day already has several events scheduled. We may have limited availability — submit anyway and our team will follow up.";

export const BOOKING_DECLINE_REASON_CODES = [
  { code: "capacity", label: "At capacity / unavailable" },
  { code: "scope_mismatch", label: "Outside scope or services" },
  { code: "budget", label: "Budget / pricing mismatch" },
  { code: "lead_time", label: "Insufficient lead time" },
  { code: "duplicate", label: "Duplicate request" },
  { code: "client_withdrew", label: "Client withdrew" },
  { code: "other", label: "Other" },
] as const;

export type BookingDeclineReasonCode = (typeof BOOKING_DECLINE_REASON_CODES)[number]["code"];

export const EVENT_CANCEL_REASON_CODES = [
  { code: "client_cancelled", label: "Client cancelled" },
  { code: "weather", label: "Weather / force majeure" },
  { code: "venue", label: "Venue issue" },
  { code: "staffing", label: "Staffing / crew unavailable" },
  { code: "duplicate", label: "Duplicate event" },
  { code: "other", label: "Other" },
] as const;

export type EventCancelReasonCode = (typeof EVENT_CANCEL_REASON_CODES)[number]["code"];

export function bookingDeclineReasonLabel(code: string | undefined) {
  return BOOKING_DECLINE_REASON_CODES.find((row) => row.code === code)?.label ?? code ?? "Unknown";
}

export function eventCancelReasonLabel(code: string | undefined) {
  return EVENT_CANCEL_REASON_CODES.find((row) => row.code === code)?.label ?? code ?? "Unknown";
}

export const EVENT_PIPELINE_STATUSES = [
  "tentative",
  "logistics",
  "scheduling",
  "ready",
] as const;

export type EventPipelineStatus = (typeof EVENT_PIPELINE_STATUSES)[number];

export type EventStatus = EventPipelineStatus | "cancelled";

export const EVENT_STATUS_FILTER_OPTIONS: Array<{ value: "" | EventStatus; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "tentative", label: "Tentative" },
  { value: "logistics", label: "Logistics" },
  { value: "scheduling", label: "Scheduling" },
  { value: "ready", label: "Ready" },
  { value: "cancelled", label: "Cancelled" },
];

export const EVENT_STATUS_EDITOR_OPTIONS: Array<{ value: EventStatus; label: string }> = [
  { value: "tentative", label: "Tentative" },
  { value: "logistics", label: "Logistics" },
  { value: "scheduling", label: "Scheduling" },
  { value: "ready", label: "Ready" },
  { value: "cancelled", label: "Cancelled" },
];

export function normalizeEventStatus(status: string | undefined): EventStatus {
  switch (status) {
    case "draft":
      return "tentative";
    case "active":
      return "scheduling";
    case "completed":
      return "ready";
    case "tentative":
    case "logistics":
    case "scheduling":
    case "ready":
    case "cancelled":
      return status;
    default:
      return "tentative";
  }
}

export function formatEventStatusLabel(status: EventStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function eventStatusBadgeTone(
  status: EventStatus,
): "neutral" | "blue" | "emerald" | "amber" | "rose" {
  if (status === "cancelled") return "rose";
  if (status === "ready") return "emerald";
  if (status === "scheduling") return "blue";
  if (status === "logistics") return "amber";
  return "neutral";
}

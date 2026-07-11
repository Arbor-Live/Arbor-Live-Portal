export const EVENT_VISIBILITIES = ["public", "internal", "informational"] as const;

export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const DEFAULT_EVENT_VISIBILITY: EventVisibility = "public";

export const EVENT_VISIBILITY_OPTIONS: Array<{ value: EventVisibility; label: string }> = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
  { value: "informational", label: "Informational (Not an event, internal only)" },
];

export function normalizeEventVisibility(visibility: string | undefined): EventVisibility {
  if (visibility === "internal" || visibility === "informational") return visibility;
  return "public";
}

export function formatEventVisibilityLabel(visibility: EventVisibility): string {
  return EVENT_VISIBILITY_OPTIONS.find((option) => option.value === visibility)?.label ?? "Public";
}

export const EVENT_EDITOR_TABS = [
  "overview",
  "schedule",
  "equipment",
  "artists",
  "billing",
  "promo",
] as const;

export type EventEditorTabId = (typeof EVENT_EDITOR_TABS)[number];

export const EVENT_EDITOR_TAB_LABELS: Record<EventEditorTabId, string> = {
  overview: "Overview",
  schedule: "Run of Show",
  equipment: "Equipment",
  artists: "Lineup",
  billing: "Billing",
  promo: "Promo",
};

export function isEventEditorTabId(value: string): value is EventEditorTabId {
  return (EVENT_EDITOR_TABS as readonly string[]).includes(value);
}

export function getEventEditorBasePath(eventId: string) {
  return `/dashboard/events/${eventId}`;
}

export function getEventEditorTabPath(eventId: string, tab: EventEditorTabId) {
  const base = getEventEditorBasePath(eventId);
  if (tab === "overview") return base;
  return `${base}/${tab}`;
}

/** Derive the active editor tab from the current pathname. */
export function activeTabFromPathname(pathname: string, eventId: string): EventEditorTabId {
  const base = getEventEditorBasePath(eventId);
  if (!pathname.startsWith(`${base}/`)) return "overview";
  const segment = pathname.slice(base.length + 1).split("/")[0] ?? "";
  return isEventEditorTabId(segment) ? segment : "overview";
}

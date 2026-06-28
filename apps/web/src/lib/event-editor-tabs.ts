export const EVENT_EDITOR_TABS = ["overview", "schedule", "equipment", "artifacts", "expenses"] as const;

export type EventEditorTabId = (typeof EVENT_EDITOR_TABS)[number];

export const EVENT_EDITOR_TAB_LABELS: Record<EventEditorTabId, string> = {
  overview: "Overview",
  schedule: "Schedule",
  equipment: "Pull List",
  artifacts: "Artifacts",
  expenses: "Expenses",
};

export function isEventEditorTabId(value: string): value is EventEditorTabId {
  return (EVENT_EDITOR_TABS as readonly string[]).includes(value);
}

export function getEventEditorBasePath(eventId?: string) {
  return eventId ? `/dashboard/events/${eventId}` : "/dashboard/events/new";
}

export function getEventEditorTabPath(eventId: string | undefined, tab: EventEditorTabId) {
  const base = getEventEditorBasePath(eventId);
  if (tab === "overview") return base;
  return `${base}/${tab}`;
}

/** Derive the active editor tab from the current pathname. */
export function activeTabFromPathname(pathname: string, eventId?: string): EventEditorTabId {
  const base = getEventEditorBasePath(eventId);
  if (pathname === base) return "overview";
  if (!pathname.startsWith(`${base}/`)) return "overview";
  const segment = pathname.slice(base.length + 1).split("/")[0] ?? "";
  if (isEventEditorTabId(segment)) return segment;
  return "overview";
}

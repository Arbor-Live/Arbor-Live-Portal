/** The event group page (a recurring series or a multi-day booking): tabs as routes. */
export const EVENT_GROUP_TABS = ["days", "run-of-show", "crew", "positions", "budget"] as const;

export type EventGroupTabId = (typeof EVENT_GROUP_TABS)[number];

export const EVENT_GROUP_TAB_LABELS: Record<EventGroupTabId, string> = {
  days: "Days",
  "run-of-show": "Run of Show template",
  crew: "Crew template",
  positions: "Positions template",
  budget: "Budget",
};

export function isEventGroupTabId(value: string): value is EventGroupTabId {
  return (EVENT_GROUP_TABS as readonly string[]).includes(value);
}

export function getEventGroupBasePath(groupId: string) {
  return `/dashboard/events/series/${groupId}`;
}

export function getEventGroupTabPath(groupId: string, tab: EventGroupTabId) {
  const base = getEventGroupBasePath(groupId);
  return tab === "days" ? base : `${base}/${tab}`;
}

/** Derive the active group tab from the current pathname. */
export function activeGroupTabFromPathname(pathname: string, groupId: string): EventGroupTabId {
  const base = getEventGroupBasePath(groupId);
  if (!pathname.startsWith(`${base}/`)) return "days";
  const segment = pathname.slice(base.length + 1).split("/")[0] ?? "";
  return isEventGroupTabId(segment) ? segment : "days";
}

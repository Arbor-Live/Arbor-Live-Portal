export const EVENT_GROUP_TABS = ["days", "schedule", "crew", "positions", "budget"] as const;

export type EventGroupTabId = (typeof EVENT_GROUP_TABS)[number];

export const EVENT_GROUP_TAB_LABELS: Record<EventGroupTabId, string> = {
  days: "Days",
  schedule: "Run of Show",
  crew: "Crew",
  positions: "Positions",
  budget: "Budget",
};

export function getEventGroupBasePath(groupId: string) {
  return `/dashboard/events/groups/${groupId}`;
}

export function getEventGroupTabPath(groupId: string, tab: EventGroupTabId) {
  const base = getEventGroupBasePath(groupId);
  return tab === "days" ? base : `${base}/${tab}`;
}

export function activeGroupTabFromPathname(pathname: string, groupId: string): EventGroupTabId {
  const base = getEventGroupBasePath(groupId);
  if (!pathname.startsWith(`${base}/`)) return "days";
  const segment = pathname.slice(base.length + 1).split("/")[0] ?? "";
  return (EVENT_GROUP_TABS as readonly string[]).includes(segment)
    ? (segment as EventGroupTabId)
    : "days";
}

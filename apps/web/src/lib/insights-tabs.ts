export const INSIGHTS_TABS = ["finances", "demand", "events", "crew", "ops", "feedback"] as const;

export type InsightsTabId = (typeof INSIGHTS_TABS)[number];

export const INSIGHTS_TAB_LABELS: Record<InsightsTabId, string> = {
  finances: "Finances",
  demand: "Demand",
  events: "Events",
  crew: "Crew",
  ops: "Ops",
  feedback: "Feedback",
};

export const INSIGHTS_BASE_PATH = "/dashboard/financial-hub/insights";

/** Finances is the landing tab; the others are `/insights/<tab>`. */
export function getInsightsTabPath(tab: InsightsTabId) {
  return tab === "finances" ? INSIGHTS_BASE_PATH : `${INSIGHTS_BASE_PATH}/${tab}`;
}

export function activeInsightsTabFromPathname(pathname: string): InsightsTabId {
  const segment = pathname.slice(INSIGHTS_BASE_PATH.length + 1).split("/")[0] ?? "";
  return (INSIGHTS_TABS as readonly string[]).includes(segment)
    ? (segment as InsightsTabId)
    : "finances";
}

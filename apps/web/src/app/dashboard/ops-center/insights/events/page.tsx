import { InsightsTabPanel } from "@/components/insights/insights-tab-panel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insights · Events",
};

export default function InsightsEventsPage() {
  return <InsightsTabPanel tab="events" />;
}

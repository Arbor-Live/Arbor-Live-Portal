import { InsightsTabPanel } from "@/components/insights/insights-tab-panel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insights · Crew",
};

export default function InsightsCrewPage() {
  return <InsightsTabPanel tab="crew" />;
}

import { InsightsTabPanel } from "@/components/insights/insights-tab-panel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insights · Demand",
};

export default function InsightsDemandPage() {
  return <InsightsTabPanel tab="demand" />;
}

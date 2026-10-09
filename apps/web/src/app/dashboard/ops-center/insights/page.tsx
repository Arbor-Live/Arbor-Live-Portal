import { InsightsTabPanel } from "@/components/insights/insights-tab-panel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insights",
};

export default function FinancialHubInsightsPage() {
  return <InsightsTabPanel tab="finances" />;
}

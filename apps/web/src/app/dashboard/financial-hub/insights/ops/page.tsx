import { InsightsTabPanel } from "@/components/insights/insights-tab-panel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insights · Ops",
};

export default function InsightsOpsPage() {
  return <InsightsTabPanel tab="ops" />;
}

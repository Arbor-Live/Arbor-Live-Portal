import { InsightsTabPanel } from "@/components/insights/insights-tab-panel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insights · Feedback",
};

export default function InsightsFeedbackPage() {
  return <InsightsTabPanel tab="feedback" />;
}

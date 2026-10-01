import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { InsightsPageClient } from "@/components/insights/insights-page-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insights",
};

export default function FinancialHubInsightsPage() {
  return (
    <ArborOnlyGuard>
      <AdminOnlyGuard>
        <InsightsPageClient />
      </AdminOnlyGuard>
    </ArborOnlyGuard>
  );
}

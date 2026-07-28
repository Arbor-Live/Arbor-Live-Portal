import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { InsightsPageClient } from "@/components/insights/insights-page-client";

export default function FinancialHubInsightsPage() {
  return (
    <ArborOnlyGuard>
      <AdminOnlyGuard>
        <InsightsPageClient />
      </AdminOnlyGuard>
    </ArborOnlyGuard>
  );
}

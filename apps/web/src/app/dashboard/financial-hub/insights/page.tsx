import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { InsightsFinancesPanel } from "@/components/insights/insights-finances-panel";

export default function FinancialHubInsightsPage() {
  return (
    <ArborOnlyGuard>
      <AdminOnlyGuard>
        <InsightsFinancesPanel />
      </AdminOnlyGuard>
    </ArborOnlyGuard>
  );
}

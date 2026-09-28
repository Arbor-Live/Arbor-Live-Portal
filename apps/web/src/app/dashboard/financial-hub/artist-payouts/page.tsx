import { FinancialHubBandPayoutsClient } from "@/components/financial/financial-hub-band-payouts-client";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function FinancialHubBandPayoutsPage() {
  return (
    <ArborOnlyGuard>
      <FinancialHubBandPayoutsClient />
    </ArborOnlyGuard>
  );
}

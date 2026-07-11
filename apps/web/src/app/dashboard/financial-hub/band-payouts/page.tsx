import { FinancialHubBandPayoutsClient } from "@/components/financial/financial-hub-band-payouts-client";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function FinancialHubBandPayoutsPage() {
  return (
    <div className="space-y-4 p-4">
      <ArborOnlyGuard>
        <div>
          <h1 className="text-2xl font-semibold">Band Payouts</h1>
          <p className="text-sm text-muted-foreground">
            Send band payment confirmation emails, track replies, and mark GrantEd payouts complete.
          </p>
        </div>
        <FinancialHubBandPayoutsClient />
      </ArborOnlyGuard>
    </div>
  );
}

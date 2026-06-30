import { FinancialHubPaymentsClient } from "@/components/financial/financial-hub-payments-client";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function FinancialHubPaymentsPage() {
  return (
    <div className="space-y-4 p-4">
      <ArborOnlyGuard>
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Track payment proof, receipts, and overdue invoices across approved events.
          </p>
        </div>
        <FinancialHubPaymentsClient />
      </ArborOnlyGuard>
    </div>
  );
}

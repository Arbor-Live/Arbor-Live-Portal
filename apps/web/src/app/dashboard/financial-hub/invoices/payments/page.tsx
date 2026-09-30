import { InvoicesShell } from "@/components/financial/invoices-shell";
import { PaymentsBoard } from "@/components/financial/payments-board";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function InvoicePaymentsPage() {
  return (
    <ArborOnlyGuard>
      <InvoicesShell tab="payments">
        <PaymentsBoard />
      </InvoicesShell>
    </ArborOnlyGuard>
  );
}

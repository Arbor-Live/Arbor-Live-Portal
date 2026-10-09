import { InvoicesShell } from "@/components/financial/invoices-shell";
import { PaymentsBoard } from "@/components/financial/payments-board";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoice payments",
};

export default function InvoicePaymentsPage() {
  return (
    <ArborOnlyGuard>
      <InvoicesShell tab="payments">
        <PaymentsBoard />
      </InvoicesShell>
    </ArborOnlyGuard>
  );
}

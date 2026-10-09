import { InvoicesListClient } from "@/components/financial/invoices-list-client";
import { InvoicesShell } from "@/components/financial/invoices-shell";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoices",
};

export default function InvoicesListPage() {
  return (
    <ArborOnlyGuard>
      <InvoicesShell tab="all">
        <InvoicesListClient />
      </InvoicesShell>
    </ArborOnlyGuard>
  );
}

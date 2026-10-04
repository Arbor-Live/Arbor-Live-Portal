import { GrantedLedgerClient } from "@/components/financial/granted-ledger-client";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GrantED ledger",
};

export default function FinancialHubGrantedPage() {
  return (
    <ArborOnlyGuard>
      <GrantedLedgerClient />
    </ArborOnlyGuard>
  );
}

import { FinancialHubBandPayoutsClient } from "@/components/financial/financial-hub-band-payouts-client";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Artist payouts",
};

export default function FinancialHubBandPayoutsPage() {
  return (
    <ArborOnlyGuard>
      <FinancialHubBandPayoutsClient />
    </ArborOnlyGuard>
  );
}

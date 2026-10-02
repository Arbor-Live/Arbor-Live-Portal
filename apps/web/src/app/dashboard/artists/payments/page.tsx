import { BandOnlyGuard } from "@/components/org-context-guard";
import { BandPayeeSettingsSection } from "@/components/bands/band-payee-settings-section";
import { BandPaymentHistorySection } from "@/components/bands/band-payment-history-section";
import { BandPaymentsHashScroller } from "@/components/bands/band-payments-hash-scroller";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Artist payments",
};

export default function BandPaymentsPage() {
  return (
    <BandOnlyGuard>
      <BandPaymentsHashScroller />
      <div className="space-y-4">
        <BandPaymentHistorySection />
        <BandPayeeSettingsSection />
      </div>
    </BandOnlyGuard>
  );
}

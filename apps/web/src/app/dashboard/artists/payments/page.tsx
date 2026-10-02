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
      {/* History is the substance; the payee sits beside it on wide screens (below that the
          rows need the full width for their amount and status columns). */}
      <div className="grid gap-4 pb-20 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          <BandPaymentHistorySection />
        </div>
        <aside className="min-w-0 2xl:sticky 2xl:top-14 2xl:self-start">
          <BandPayeeSettingsSection />
        </aside>
      </div>
    </BandOnlyGuard>
  );
}

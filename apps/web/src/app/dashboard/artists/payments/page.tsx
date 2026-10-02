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
      {/* History is the substance; the payee sits beside it like the event page's aside. */}
      <div className="grid gap-4 pb-20 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          <BandPaymentHistorySection />
        </div>
        <aside className="min-w-0 xl:sticky xl:top-14 xl:self-start">
          <BandPayeeSettingsSection />
        </aside>
      </div>
    </BandOnlyGuard>
  );
}

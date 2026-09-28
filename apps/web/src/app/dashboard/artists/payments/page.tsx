import { BandOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import { BandPayeeSettingsSection } from "@/components/bands/band-payee-settings-section";
import { BandPaymentHistorySection } from "@/components/bands/band-payment-history-section";
import { BandPaymentsHashScroller } from "@/components/bands/band-payments-hash-scroller";

export default function BandPaymentsPage() {
  return (
    <div className="space-y-4">
      <BandPaymentsHashScroller />
      <PageHeader
        back={{ href: "/dashboard/artists", label: "Artists" }}
        title="Payments"
        description="Manage your artist's payout payee and e-sign payment agreements for performances."
      />
      <BandOnlyGuard>
        <div className="space-y-4">
          <BandPaymentHistorySection />
          <BandPayeeSettingsSection />
        </div>
      </BandOnlyGuard>
    </div>
  );
}

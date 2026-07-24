import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BandOnlyGuard } from "@/components/org-context-guard";
import { BandPayeeSettingsSection } from "@/components/bands/band-payee-settings-section";
import { BandPaymentHistorySection } from "@/components/bands/band-payment-history-section";
import { BandPaymentsHashScroller } from "@/components/bands/band-payments-hash-scroller";

export default function BandPaymentsPage() {
  return (
    <div className="space-y-4">
      <BandPaymentsHashScroller />
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            Manage your band&apos;s payout payee and e-sign payment agreements for performances.
          </CardDescription>
        </CardHeader>
      </Card>
      <BandOnlyGuard>
        <div className="space-y-4">
          <BandPaymentHistorySection />
          <BandPayeeSettingsSection />
        </div>
      </BandOnlyGuard>
    </div>
  );
}

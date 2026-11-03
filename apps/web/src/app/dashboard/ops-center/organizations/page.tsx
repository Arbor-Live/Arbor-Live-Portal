import { Suspense } from "react";
import type { Metadata } from "next";
import { BillingHostsManager } from "@/components/financial/billing-hosts/billing-hosts-manager";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export const metadata: Metadata = {
  title: "Billing hosts",
};

export default function BillingHostsPage() {
  return (
    <ArborOnlyGuard>
      <Suspense>
        <BillingHostsManager />
      </Suspense>
    </ArborOnlyGuard>
  );
}

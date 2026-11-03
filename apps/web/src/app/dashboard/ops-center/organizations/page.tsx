import { Suspense } from "react";
import type { Metadata } from "next";
import { BillingHostsManager } from "@/components/financial/billing-hosts/billing-hosts-manager";
import { ArborOnlyGuard, OperationsOrAdminGuard } from "@/components/org-context-guard";

export const metadata: Metadata = {
  title: "Billing hosts",
};

export default function BillingHostsPage() {
  return (
    <ArborOnlyGuard>
      <OperationsOrAdminGuard>
        <Suspense>
          <BillingHostsManager />
        </Suspense>
      </OperationsOrAdminGuard>
    </ArborOnlyGuard>
  );
}

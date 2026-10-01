import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import { FinancialHubSettings } from "@/components/financial/financial-hub-settings";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ops Center settings",
};

export default function FinancialHubSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/financial-hub", label: "Ops Center" }}
        title="Ops Center settings"
        description="Fee definitions, terms templates, and crew cost defaults used across quotes and invoices."
      />
      <ArborOnlyGuard>
        <AdminOnlyGuard>
          <FinancialHubSettings />
        </AdminOnlyGuard>
      </ArborOnlyGuard>
    </div>
  );
}

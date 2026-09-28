import { ArborOnlyGuard } from "@/components/org-context-guard";
import { FinancialHubOrganizationsClient } from "@/components/financial/financial-hub-organizations-client";
import { PageHeader } from "@/components/page-header";

export default function FinancialHubOrganizationsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/financial-hub", label: "Ops Center" }}
        title="Host Organizations"
        description="Manage host orgs and their client contacts for invoices and booking requests."
      />
      <ArborOnlyGuard>
        <FinancialHubOrganizationsClient />
      </ArborOnlyGuard>
    </div>
  );
}

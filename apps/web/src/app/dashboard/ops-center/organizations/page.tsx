import { ArborOnlyGuard } from "@/components/org-context-guard";
import { FinancialHubOrganizationsClient } from "@/components/financial/financial-hub-organizations-client";
import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing hosts",
};

export default function FinancialHubOrganizationsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/ops-center", label: "Ops Center" }}
        title="Billing hosts"
        description="The clients we invoice and host events for, with their contacts, aliases, and merges. Portal organizations (Arbor Live, artists) are under Users."
      />
      <ArborOnlyGuard>
        <FinancialHubOrganizationsClient />
      </ArborOnlyGuard>
    </div>
  );
}

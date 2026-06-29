import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { FinancialHubOrganizationsClient } from "@/components/financial/financial-hub-organizations-client";

export default function FinancialHubOrganizationsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Host Organizations</CardTitle>
          <CardDescription>
            Manage host orgs and their client contacts for invoices and booking requests.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <FinancialHubOrganizationsClient />
      </ArborOnlyGuard>
    </div>
  );
}

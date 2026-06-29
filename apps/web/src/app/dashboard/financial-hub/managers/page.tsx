import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { FinancialHubManagersClient } from "@/components/financial/financial-hub-managers-client";

export default function FinancialHubManagersPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Invoice Managers</CardTitle>
          <CardDescription>
            Admin roster for users assignable as invoice managers on quotes and invoices.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <FinancialHubManagersClient />
      </ArborOnlyGuard>
    </div>
  );
}

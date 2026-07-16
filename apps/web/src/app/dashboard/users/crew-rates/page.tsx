import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { UserRatesAdminClient } from "@/components/users/user-rates-admin-client";

export default function CrewRatesPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Crew Rates</CardTitle>
          <CardDescription>
            Set Normal and Lead hourly rates used for invoices and empty-shift cost estimates
            (default estimate uses the average of both). Per-user rates below are used when crew
            are assigned.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <UserRatesAdminClient />
      </ArborOnlyGuard>
    </div>
  );
}

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
            Admin-only hourly rates used to calculate event crew costs and overtime.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <UserRatesAdminClient />
      </ArborOnlyGuard>
    </div>
  );
}

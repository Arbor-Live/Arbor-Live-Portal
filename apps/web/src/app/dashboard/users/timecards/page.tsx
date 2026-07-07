import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { AdminTimecardsOverviewClient } from "@/components/timecards/admin-timecards-overview-client";

export default function AdminTimecardsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Crew Timecards</CardTitle>
          <CardDescription>
            Admin review of crew hours derived from scheduled shifts, grouped by pay period.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <AdminTimecardsOverviewClient />
      </ArborOnlyGuard>
    </div>
  );
}

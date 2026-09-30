import { ArborOnlyGuard } from "@/components/org-context-guard";
import { AdminTimecardsOverviewClient } from "@/components/timecards/admin-timecards-overview-client";

export default function AdminTimecardsPage() {
  return (
    <ArborOnlyGuard>
      <AdminTimecardsOverviewClient />
    </ArborOnlyGuard>
  );
}

import { ArborOnlyGuard } from "@/components/org-context-guard";
import { AdminTimecardDetailClient } from "@/components/timecards/admin-timecard-detail-client";

export default async function AdminTimecardDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  return (
    <ArborOnlyGuard>
      <AdminTimecardDetailClient userId={userId} />
    </ArborOnlyGuard>
  );
}

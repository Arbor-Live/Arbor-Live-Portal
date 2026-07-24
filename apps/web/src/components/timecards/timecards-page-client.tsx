"use client";

import { useSessionShell } from "@/components/session-shell-provider";
import { AdminTimecardsOverviewClient } from "@/components/timecards/admin-timecards-overview-client";
import { TimecardsClient } from "@/components/timecards/timecards-client";
import { Skeleton } from "@/components/ui/skeleton";

export function TimecardsPageClient() {
  const shell = useSessionShell();
  const viewer = shell?.viewer;
  const activeOrganization = shell === undefined ? undefined : (shell?.activeOrganization ?? null);
  if (!viewer || activeOrganization === undefined) {
    return <Skeleton className="h-48 w-full" />;
  }

  const isAdminInArbor =
    viewer.isAdmin &&
    activeOrganization?.organizationType === "arbor_internal";

  if (isAdminInArbor) {
    return <AdminTimecardsOverviewClient />;
  }

  return <TimecardsClient />;
}

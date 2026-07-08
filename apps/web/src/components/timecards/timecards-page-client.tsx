"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { AdminTimecardsOverviewClient } from "@/components/timecards/admin-timecards-overview-client";
import { TimecardsClient } from "@/components/timecards/timecards-client";
import { Skeleton } from "@/components/ui/skeleton";

export function TimecardsPageClient() {
  const viewer = useQuery(api.users.getViewer, {});
  const activeOrganization = useQuery(api.users.getActiveOrganization, {});

  if (viewer === undefined || activeOrganization === undefined) {
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

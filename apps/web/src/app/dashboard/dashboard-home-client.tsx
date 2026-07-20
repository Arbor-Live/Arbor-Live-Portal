"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { AdminDashboard } from "@/components/admin-dashboard/admin-dashboard";
import { CrewDashboard } from "@/components/crew-portal/crew-dashboard";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardHomeClient() {
  const router = useRouter();
  const viewer = useQuery(api.users.getViewer, {});
  const activeOrganization = useQuery(api.users.getActiveOrganization, {});

  useEffect(() => {
    if (!viewer || activeOrganization === undefined) return;
    if (viewer.isAdmin && activeOrganization?.organizationType === "arbor_internal") {
      return;
    }
    if (!viewer.isCrewOnly) {
      router.replace(
        activeOrganization?.organizationType === "band" ? "/dashboard/media" : "/dashboard/events",
      );
    }
  }, [viewer, activeOrganization, router]);

  if (!viewer || activeOrganization === undefined) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (viewer.isAdmin && activeOrganization?.organizationType === "arbor_internal") {
    return <AdminDashboard />;
  }

  if (viewer.isAdmin) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!viewer.isCrewOnly) {
    return <Skeleton className="h-48 w-full" />;
  }

  return <CrewDashboard />;
}

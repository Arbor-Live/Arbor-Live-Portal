"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { CrewDashboard } from "@/components/crew-portal/crew-dashboard";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardHomeClient() {
  const router = useRouter();
  const viewer = useQuery(api.users.getViewer, {});
  const activeOrganization = useQuery(api.users.getActiveOrganization, {});

  useEffect(() => {
    if (!viewer) return;
    if (viewer.isAdmin) {
      router.replace("/dashboard/events");
      return;
    }
    if (!viewer.isCrewOnly) {
      router.replace(
        activeOrganization?.organizationType === "band" ? "/dashboard/media" : "/dashboard/events",
      );
    }
  }, [viewer, activeOrganization?.organizationType, router]);

  if (viewer === undefined) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!viewer.isCrewOnly) {
    return <Skeleton className="h-48 w-full" />;
  }

  return <CrewDashboard />;
}

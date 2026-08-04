"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard/admin-dashboard";
import { BandDashboard } from "@/components/bands/band-dashboard";
import { CrewDashboard } from "@/components/crew-portal/crew-dashboard";
import { useSessionShell } from "@/components/session-shell-provider";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardHomeClient() {
  const router = useRouter();
  const shell = useSessionShell();
  const viewer = shell?.viewer;
  const activeOrganization = shell === undefined ? undefined : (shell?.activeOrganization ?? null);

  useEffect(() => {
    if (!viewer || activeOrganization === undefined) return;
    if (viewer.isAdmin && activeOrganization?.organizationType === "arbor_internal") {
      return;
    }
    if (activeOrganization?.organizationType === "band") {
      return;
    }
    if (!viewer.isCrewOnly) {
      router.replace("/dashboard/events");
    }
  }, [viewer, activeOrganization, router]);

  if (!viewer || activeOrganization === undefined) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (viewer.isAdmin && activeOrganization?.organizationType === "arbor_internal") {
    return <AdminDashboard />;
  }

  if (activeOrganization?.organizationType === "band") {
    return <BandDashboard />;
  }

  if (viewer.isAdmin) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!viewer.isCrewOnly) {
    return <Skeleton className="h-48 w-full" />;
  }

  return <CrewDashboard />;
}

"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { CustomizableWidgetDashboard } from "@/components/dashboard/customizable-widget-dashboard";
import { getWidgetsForDisciplines } from "@/components/crew-portal/widget-registry";
import { Skeleton } from "@/components/ui/skeleton";

export function CrewDashboard() {
  const viewer = useQuery(api.users.getViewer, {});

  if (viewer === undefined) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const widgets = getWidgetsForDisciplines(viewer.disciplines);

  return (
    <CustomizableWidgetDashboard
      dashboardKey="crewHome"
      title="Home"
      description="Your crew dashboard — availability, schedule, media, and pay periods."
      widgets={widgets}
    />
  );
}

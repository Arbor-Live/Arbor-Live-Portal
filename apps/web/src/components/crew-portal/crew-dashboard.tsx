"use client";

import { CustomizableWidgetDashboard } from "@/components/dashboard/customizable-widget-dashboard";
import { OnShiftCard } from "@/components/crew-portal/on-shift-card";
import { getWidgetsForDisciplines } from "@/components/crew-portal/widget-registry";
import { useSessionViewer } from "@/components/session-shell-provider";
import { Skeleton } from "@/components/ui/skeleton";

export function CrewDashboard() {
  const viewer = useSessionViewer();
  if (!viewer) {
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
    <div className="space-y-4">
      <OnShiftCard />
      <CustomizableWidgetDashboard
        dashboardKey="crewHome"
        title="Home"
        description="Your crew dashboard — availability, schedule, media, and pay periods."
        widgets={widgets}
      />
    </div>
  );
}

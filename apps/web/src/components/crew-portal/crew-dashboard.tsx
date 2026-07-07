"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { getWidgetsForTeams, type UserTeam } from "@/components/crew-portal/widget-registry";
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

  const widgets = getWidgetsForTeams(viewer.teams as UserTeam[]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="text-sm text-muted-foreground">
          Your crew dashboard — availability, schedule, media, and pay periods.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {widgets.map((widget) => {
          const Widget = widget.component;
          return <Widget key={widget.id} />;
        })}
      </div>
    </div>
  );
}

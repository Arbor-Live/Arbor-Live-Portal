"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function statusBadgeClass(status: "open" | "due" | "past_due") {
  switch (status) {
    case "open":
      return "bg-emerald-500/10 text-emerald-700";
    case "due":
      return "bg-amber-500/10 text-amber-700";
    case "past_due":
      return "bg-red-500/10 text-red-700";
  }
}

function statusLabel(status: "open" | "due" | "past_due") {
  switch (status) {
    case "open":
      return "Open";
    case "due":
      return "Due";
    case "past_due":
      return "Past due";
  }
}

export function AdminTimecardsOverviewClient() {
  const [now] = useState(() => Date.now());
  const [periodIndex, setPeriodIndex] = useState(0);
  const overview = useQuery(api.timecards.listCrewTimecardOverview, { now, periodIndex });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Crew Timecards</h1>
        <p className="text-sm text-muted-foreground">
          Review crew hours by pay period. Open a crew member to see day-by-day details.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((index) => (
          <Button
            key={index}
            type="button"
            size="sm"
            variant={periodIndex === index ? "default" : "outline"}
            onClick={() => setPeriodIndex(index)}
          >
            {index === 0 ? "Current" : index === 1 ? "Previous" : "2 periods ago"}
          </Button>
        ))}
      </div>

      {overview === undefined ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">{overview.period.label}</CardTitle>
              <p className="text-xs text-muted-foreground">Due {formatDate(overview.period.dueMs)}</p>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                statusBadgeClass(overview.period.status),
              )}
            >
              {statusLabel(overview.period.status)}
            </span>
          </CardHeader>
          <CardContent>
            {overview.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active crew profiles found.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Crew member</th>
                      <th className="px-3 py-2 font-medium text-right">Days worked</th>
                      <th className="px-3 py-2 font-medium text-right">Hours worked</th>
                      <th className="px-3 py-2 font-medium text-right">Hours to input</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {overview.rows.map((row) => (
                      <tr key={row.userId} className="border-t">
                        <td className="px-3 py-2">
                          <p className="font-medium">{row.name}</p>
                          <p className="text-xs text-muted-foreground">{row.email}</p>
                        </td>
                        <td className="px-3 py-2 text-right">{row.daysWorked}</td>
                        <td className="px-3 py-2 text-right">{row.totalActualHours.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {row.totalInputHours.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/dashboard/users/timecards/${row.userId}`}>View</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

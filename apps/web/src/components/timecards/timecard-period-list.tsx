"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimecardDetail } from "@/components/timecards/timecard-detail";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type TimecardPeriod = {
  label: string;
  dueMs: number;
  daysWorked: number;
  status: "open" | "due" | "past_due";
  days: Array<{
    dateMs: number;
    events: Array<{
      eventId: string;
      title: string;
      actualHours: number;
      inputHours: number;
    }>;
    totalActual: number;
    totalInput: number;
  }>;
};

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

export function TimecardPeriodList({ periods }: { periods: TimecardPeriod[] }) {
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);

  if (!periods.length) {
    return <p className="text-sm text-muted-foreground">No shifts recorded in recent pay periods.</p>;
  }

  return (
    <>
      {periods.map((period) => {
        const isExpanded = expandedLabel === period.label;
        return (
          <Card key={period.label}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base">{period.label}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Due {formatDate(period.dueMs)} · {period.daysWorked} days worked
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  statusBadgeClass(period.status),
                )}
              >
                {statusLabel(period.status)}
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setExpandedLabel(isExpanded ? null : period.label)}
              >
                {isExpanded ? "Hide details" : "Show day-by-day details"}
              </button>
              {isExpanded ? <TimecardDetail days={period.days} /> : null}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}

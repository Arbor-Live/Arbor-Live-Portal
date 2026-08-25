"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createColumnHelper } from "@tanstack/react-table";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { type DataTableFeatures } from "@/components/ui/data-table-features";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type TimecardOverviewRow = FunctionReturnType<
  typeof api.timecards.listCrewTimecardOverview
>["rows"][number];

const columnHelper = createColumnHelper<DataTableFeatures, TimecardOverviewRow>();

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

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          id: "crew",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Crew member" />,
          cell: ({ row }) => (
            <div>
              <p className="font-medium">{row.original.name}</p>
              <p className="text-xs text-muted-foreground">{row.original.email}</p>
            </div>
          ),
        }),
        columnHelper.accessor("daysWorked", {
          id: "daysWorked",
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Days worked" className="justify-end" />
          ),
          cell: ({ getValue }) => <div className="text-right">{getValue()}</div>,
          sortFn: "basic",
        }),
        columnHelper.accessor("totalActualHours", {
          id: "hoursWorked",
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Hours worked" className="justify-end" />
          ),
          cell: ({ getValue }) => <div className="text-right">{getValue().toFixed(2)}</div>,
          sortFn: "basic",
        }),
        columnHelper.accessor("totalInputHours", {
          id: "hoursToInput",
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Hours to input" className="justify-end" />
          ),
          cell: ({ getValue }) => (
            <div className="text-right font-medium">{getValue().toFixed(2)}</div>
          ),
          sortFn: "basic",
        }),
        columnHelper.display({
          id: "actions",
          enableSorting: false,
          enableHiding: false,
          header: () => null,
          cell: ({ row }) => (
            <div className="text-right">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/users/timecards/${row.original.userId}`}>View</Link>
              </Button>
            </div>
          ),
        }),
      ]),
    [],
  );

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
            <DataTable
              columns={columns}
              data={overview.rows}
              getRowId={(row) => row.userId}
              initialSorting={[{ id: "hoursToInput", desc: true }]}
              emptyMessage="No active crew profiles found."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";

export function DamageReportsWidget() {
  const openReports = useQuery(api.damageReports.list, { status: "open" });
  const inProgressReports = useQuery(api.damageReports.list, { status: "in_progress" });

  const loading = openReports === undefined || inProgressReports === undefined;
  const openCount = openReports?.length ?? 0;
  const inProgressCount = inProgressReports?.length ?? 0;
  const preview = [...(openReports ?? []), ...(inProgressReports ?? [])]
    .sort((a, b) => b.reportedAt - a.reportedAt)
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <WarningCircleIcon className="size-4" />
          Damage & repair
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/inventory/damage">Queue</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : openCount + inProgressCount === 0 ? (
          <p className="text-sm text-muted-foreground">No open damage reports.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {openCount} open · {inProgressCount} in progress
            </p>
            {preview.map((report) => (
              <Link
                key={report._id}
                href="/dashboard/inventory/damage"
                className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <p className="font-medium">
                  {report.assetId ?? "No ID"}
                  {report.typeName ? ` · ${report.typeName}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Severity {report.severity}/5 ·{" "}
                  <span className="capitalize">{report.operability.replace("_", " ")}</span> ·{" "}
                  <span className="capitalize">{report.status.replace("_", " ")}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {report.eventTitle ?? "Event unknown"} · {formatDateTime(report.reportedAt)}
                </p>
              </Link>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

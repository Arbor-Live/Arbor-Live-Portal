"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { DamageReportWizard } from "@/components/inventory/damage-report-wizard";
import { useSessionViewer } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  optimisticDecommissionDamageReport,
  optimisticUpdateDamageStatus,
} from "@/lib/damage-reports-optimistic";

export function DamageQueueManager() {
  const [statusFilter, setStatusFilter] = useState<"open" | "in_progress" | "resolved" | "all">(
    "open",
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateStatus = useMutation(api.damageReports.updateStatus).withOptimisticUpdate(
    optimisticUpdateDamageStatus,
  );
  const decommission = useMutation(api.damageReports.decommission).withOptimisticUpdate(
    optimisticDecommissionDamageReport,
  );  const reports = useQuery(api.damageReports.list, {
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const viewer = useSessionViewer();
  const canTriage = Boolean(
    viewer?.isAdmin || viewer?.verticals?.includes("Operations"),
  );

  const rows = useMemo(() => reports ?? [], [reports]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Damage & repair</h1>
          <p className="text-sm text-muted-foreground">
            Crew can report damage. Operations/admin triage the queue.
          </p>
        </div>
        <Button type="button" onClick={() => setWizardOpen(true)}>
          Report damage
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["open", "in_progress", "resolved", "all"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={statusFilter === value ? "default" : "outline"}
            onClick={() => setStatusFilter(value)}
          >
            {value === "all" ? "All" : value.replace("_", " ")}
          </Button>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-3">
        {rows.map((report) => (
          <Card key={report._id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {report.assetId}
                {report.typeName ? ` · ${report.typeName}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Severity {report.severity}/5 · {report.operability.replace("_", " ")} · {report.status}
              </p>
              <p>
                Event:{" "}
                {report.eventTitle ? (
                  <a
                    className="text-foreground underline"
                    href={`/dashboard/events/${report.eventId}`}
                  >
                    {report.eventTitle}
                  </a>
                ) : (
                  "Unknown / not linked"
                )}
              </p>
              {report.notes ? <p>{report.notes}</p> : null}
              {report.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={report.photoUrl}
                  alt={`Damage photo for ${report.assetId}`}
                  className="max-h-40 rounded border object-cover"
                />
              ) : null}
              {canTriage && report.status !== "resolved" ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {report.status === "open" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void updateStatus({
                          reportId: report._id as Id<"damageReports">,
                          status: "in_progress",
                        }).catch((err) => setError(getConvexErrorMessage(err)))
                      }
                    >
                      Mark in progress
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      void updateStatus({
                        reportId: report._id as Id<"damageReports">,
                        status: "resolved",
                      }).catch((err) => setError(getConvexErrorMessage(err)))
                    }
                  >
                    Resolve (repaired)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Decommission ${report.assetId}? It will be marked out of service and this report will close.`,
                        )
                      ) {
                        return;
                      }
                      void decommission({
                        reportId: report._id as Id<"damageReports">,
                      }).catch((err) => setError(getConvexErrorMessage(err)));
                    }}
                  >
                    Decommission
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {!rows.length ? (
          <p className="text-sm text-muted-foreground">No damage reports in this filter.</p>
        ) : null}
      </div>

      <DamageReportWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}

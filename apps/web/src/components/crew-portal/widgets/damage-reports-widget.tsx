"use client";

import { useQuery } from "convex/react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { DashboardWidget, WidgetRows } from "@/components/dashboard/dashboard-widget";
import { RowFlag, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
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
    <DashboardWidget
      icon={WarningCircleIcon}
      title="Damage & repair"
      link={{ href: "/dashboard/inventory/damage", label: "Queue" }}
      testId="home-damage-reports"
      summary={loading || openCount + inProgressCount === 0 ? null : `${openCount} open · ${inProgressCount} in progress · newest first`}
    >
      <WidgetRows loading={loading} empty={preview.length === 0 ? "No open damage reports." : null}>
        {preview.map((report) => (
          <ListRow key={report._id} href={`/dashboard/inventory/damage?report=${report._id}`}>
            <div className="min-w-0 flex-1 space-y-1">
              <RowText
                eyebrow={formatDateTime(report.reportedAt)}
                title={`${report.assetId ?? "No ID"}${report.typeName ? ` · ${report.typeName}` : ""}`}
                detail={report.eventTitle ?? "Event unknown"}
              />
              <div className="flex flex-wrap gap-1">
                {report.operability === "needs_repair" ? (
                  <RowFlag tone={report.severity >= 4 ? "rose" : "amber"}>Needs repair</RowFlag>
                ) : null}
                <RowFlag tone="neutral">Severity {report.severity}/5</RowFlag>
              </div>
            </div>
          </ListRow>
        ))}
      </WidgetRows>
    </DashboardWidget>
  );
}

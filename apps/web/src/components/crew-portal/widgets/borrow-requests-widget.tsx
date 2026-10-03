"use client";

import { useQuery } from "convex/react";
import { PackageIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { DashboardWidget, WidgetRows } from "@/components/dashboard/dashboard-widget";
import { RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { StatusPill, type Tone } from "@/components/page-header";
import { formatDateTimeRange } from "@/lib/format";

const HREF = "/dashboard/inventory/borrow-requests";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  submitted: { label: "Pending review", tone: "amber" },
  approved: { label: "Approved", tone: "emerald" },
  rejected: { label: "Not approved", tone: "rose" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function BorrowRequestsWidget() {
  const requests = useQuery(api.equipmentBorrowRequests.listMine);

  return (
    <DashboardWidget icon={PackageIcon} title="Equipment requests" link={{ href: HREF, label: "View all" }} testId="home-borrow-requests">
      <WidgetRows loading={requests === undefined} empty={requests?.length === 0 ? "No equipment requests yet." : null}>
        {requests?.slice(0, 5).map((request) => {
          const status = STATUS[request.status] ?? { label: request.status, tone: "neutral" as Tone };
          return (
            <ListRow key={request._id} href={HREF}>
              <RowText title={request.purpose} detail={formatDateTimeRange(request.startAt, request.endAt)} />
              <StatusPill tone={status.tone} className="h-6 shrink-0">
                {status.label}
              </StatusPill>
            </ListRow>
          );
        })}
      </WidgetRows>
    </DashboardWidget>
  );
}

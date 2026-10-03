"use client";

import { useQuery } from "convex/react";
import { ClipboardTextIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { DashboardWidget, WidgetRows } from "@/components/dashboard/dashboard-widget";
import { RowFlag, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { formatDateTime } from "@/lib/format";

export function AdminBookingRequestsWidget() {
  const requests = useQuery(api.dashboardHome.listOpenBookingRequests, {
    limit: 5,
  });

  return (
    <DashboardWidget
      icon={ClipboardTextIcon}
      title="Booking requests"
      link={{ href: "/dashboard/financial-hub/requests", label: "Open queue" }}
      testId="home-booking-requests"
    >
      <WidgetRows
        loading={requests === undefined}
        empty={requests?.length === 0 ? "No open booking requests right now." : null}
      >
        {requests?.map((request) => (
          <ListRow key={request._id} href={`/dashboard/financial-hub/requests/${request._id}`}>
            <RowText
              eyebrow={`Submitted ${formatDateTime(request.submittedAt)}`}
              title={request.eventName?.trim() || request.organization?.trim() || request.requestNumber}
              detail={[request.requestNumber, request.venueName].filter(Boolean).join(" · ")}
            />
            {request.status === "action_required" ? <RowFlag>Action required</RowFlag> : null}
          </ListRow>
        ))}
      </WidgetRows>
    </DashboardWidget>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { ClipboardTextIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { DashboardWidget, WidgetRows } from "@/components/dashboard/dashboard-widget";
import { RowFlag, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { formatDateTime } from "@/lib/format";

const HREF = "/dashboard/events/post-event";

export function PostEventWorkWidget() {
  const [now] = useState(() => Date.now());
  const rows = useQuery(api.crewPortal.listMyPostEventWork, { now });
  const pending = (rows ?? []).filter((row) => !row.feedbackSubmitted || !row.mediaResolved);

  return (
    <DashboardWidget icon={ClipboardTextIcon} title="Post-event work" link={{ href: HREF, label: "View all" }} testId="home-post-event-work">
      <WidgetRows
        loading={rows === undefined}
        empty={pending.length === 0 ? "No events awaiting your review or photos." : null}
      >
        {pending.slice(0, 5).map((row) => (
          <ListRow key={row.eventId} href={HREF}>
            <RowText title={row.title} detail={`Ended ${formatDateTime(row.endAt)}`} />
            {!row.feedbackSubmitted ? <RowFlag>Review</RowFlag> : null}
            {!row.mediaResolved ? <RowFlag>Photos</RowFlag> : null}
          </ListRow>
        ))}
      </WidgetRows>
    </DashboardWidget>
  );
}

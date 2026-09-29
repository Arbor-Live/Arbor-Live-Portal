"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import {
  CalendarBlankIcon,
  CalendarDotsIcon,
  MicrophoneStageIcon,
  ReceiptIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { MetaItem, PageHeader, PageTabs, StatusPill, type Tone } from "@/components/page-header";
import {
  activeGroupTabFromPathname,
  EVENT_GROUP_TABS,
  EVENT_GROUP_TAB_LABELS,
  getEventGroupTabPath,
  type EventGroupTabId,
} from "@/lib/event-group-tabs";

const GROUP_TAB_ICONS: Record<EventGroupTabId, Icon> = {
  days: CalendarBlankIcon,
  schedule: CalendarDotsIcon,
  crew: UsersThreeIcon,
  positions: MicrophoneStageIcon,
  budget: ReceiptIcon,
};

function groupStatusTone(status: "active" | "paused" | "ended"): Tone {
  if (status === "active") return "emerald";
  if (status === "paused") return "amber";
  return "neutral";
}

/** Header + route tabs for an event group; tab content renders as children. */
export function EventGroupShell({
  groupId,
  children,
}: {
  groupId: Id<"eventSeries">;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const data = useQuery(api.eventGroups.get, { id: groupId });

  if (data === undefined) {
    return <p className="text-sm text-muted-foreground">Loading group…</p>;
  }
  if (!data) {
    return <p className="text-sm text-status-rose-700">Event group not found.</p>;
  }

  const { group, kind, dayCount } = data;
  const active = activeGroupTabFromPathname(pathname, groupId);
  const isRecurring = kind === "recurring";

  return (
    <div className="space-y-4 pb-24" data-testid="event-group-page">
      <PageHeader
        back={{ href: "/dashboard/events", label: "Events" }}
        pills={
          <>
            <StatusPill tone={isRecurring ? "blue" : "neutral"}>
              {isRecurring ? "Recurring" : "Multi-day"}
            </StatusPill>
            <StatusPill tone={groupStatusTone(group.status)}>{group.status}</StatusPill>
          </>
        }
        title={group.title}
        meta={
          <>
            <MetaItem icon={CalendarBlankIcon}>
              {dayCount} {dayCount === 1 ? "day" : "days"}
            </MetaItem>
            {group.venueName ? <MetaItem icon={CalendarBlankIcon}>{group.venueName}</MetaItem> : null}
          </>
        }
      />

      <PageTabs
        label="Group sections"
        tabs={EVENT_GROUP_TABS.map((tab) => ({
          href: getEventGroupTabPath(groupId, tab),
          label: EVENT_GROUP_TAB_LABELS[tab],
          icon: GROUP_TAB_ICONS[tab],
          active: tab === active,
          badge:
            tab === "days" && dayCount > 0 ? (
              <span className="text-xs tabular-nums text-muted-foreground" aria-hidden>
                {dayCount}
              </span>
            ) : undefined,
        }))}
      />

      {children}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  BuildingsIcon,
  CalendarBlankIcon,
  CalendarDotsIcon,
  CurrencyDollarIcon,
  MapPinIcon,
  MicrophoneStageIcon,
  RepeatIcon,
  SpeakerHighIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDialog } from "@/components/ui/app-dialog";
import { MetaItem, PageHeader, PageTabs, StatusPill, type Tone } from "@/components/page-header";
import { EventSeriesScheduleEditor } from "@/components/events/event-series-schedule-editor";
import { EventSeriesShiftEditor } from "@/components/events/event-series-shift-editor";
import { EventSeriesPositionEditor } from "@/components/events/event-series-position-editor";
import { EventGroupContext, useEventGroup } from "@/components/events/group/event-group-context";
import { EventGroupDaysTab } from "@/components/events/group/event-group-days-tab";
import { EventGroupBudgetTab } from "@/components/events/group/event-group-budget-tab";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { formatDate } from "@/lib/format";
import {
  EVENT_GROUP_KIND_LABELS,
  eventGroupKind,
  groupDayNoun,
} from "@/lib/event-series";
import {
  EVENT_GROUP_TABS,
  EVENT_GROUP_TAB_LABELS,
  activeGroupTabFromPathname,
  getEventGroupTabPath,
  type EventGroupTabId,
} from "@/lib/event-group-tabs";

const TAB_ICONS: Record<EventGroupTabId, Icon> = {
  days: CalendarDotsIcon,
  "run-of-show": SpeakerHighIcon,
  crew: UsersThreeIcon,
  positions: MicrophoneStageIcon,
  budget: CurrencyDollarIcon,
};

const GROUP_STATUS_TONES: Record<"active" | "paused" | "ended", Tone> = {
  active: "emerald",
  paused: "amber",
  ended: "neutral",
};

const GROUP_STATUS_LABELS: Record<"active" | "paused" | "ended", string> = {
  active: "Active",
  paused: "Paused",
  ended: "Ended",
};

function intervalLabel(weeks: number | undefined) {
  if (!weeks || weeks === 1) return "Weekly";
  return `Every ${weeks} weeks`;
}

function EventGroupHeader() {
  const { groupId, data, kind } = useEventGroup();
  const { confirm } = useAppDialog();
  const endSeries = useMutation(api.eventSeries.endSeries);
  if (!data) return null;
  const { series, occurrences } = data;
  const multiDay = kind === "multi_day";
  const first = occurrences[0];
  const last = occurrences[occurrences.length - 1];
  const nouns = groupDayNoun(kind, true);

  async function handleEnd() {
    const shouldEnd = await confirm({
      title: `End ${series.title}?`,
      description: `The ${multiDay ? "booking" : "series"} is marked ended. Its ${nouns} stay as they are.`,
      confirmLabel: multiDay ? "End booking" : "End series",
      destructive: true,
    });
    if (!shouldEnd) return;
    try {
      await endSeries({ id: groupId });
      notify.success(multiDay ? "Booking marked as ended." : "Series marked as ended.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Failed to end."));
    }
  }

  return (
    <PageHeader
      back={{ href: "/dashboard/events", label: "Events" }}
      actions={
        series.invoiceId ? (
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href={`/dashboard/financial-hub/invoices/${series.invoiceId}`}>Open invoice</Link>
          </Button>
        ) : null
      }
      menuLabel={multiDay ? "More booking actions" : "More series actions"}
      menu={
        series.status !== "ended" ? (
          <DropdownMenuItem variant="destructive" onSelect={() => void handleEnd()}>
            {multiDay ? "End booking" : "End series"}
          </DropdownMenuItem>
        ) : null
      }
      pills={
        <>
          <StatusPill tone="blue" dot={false}>
            {multiDay ? (
              <CalendarDotsIcon className="size-3.5" aria-hidden />
            ) : (
              <RepeatIcon className="size-3.5" aria-hidden />
            )}
            {EVENT_GROUP_KIND_LABELS[kind]}
          </StatusPill>
          <StatusPill tone={GROUP_STATUS_TONES[series.status]}>
            {GROUP_STATUS_LABELS[series.status]}
          </StatusPill>
        </>
      }
      title={series.title}
      description={
        multiDay
          ? "Days that share one invoice. Set up the Run of Show, crew slots and positions once and apply them to all days, later days, or one day. Acts are booked per day."
          : `${intervalLabel(series.intervalWeeks)} series. Set up the Run of Show, crew slots and positions once and apply them to every occurrence. Acts are booked per occurrence.`
      }
      meta={
        <>
          <MetaItem icon={CalendarBlankIcon}>
            {first && last
              ? first === last
                ? formatDate(first.startAt)
                : `${formatDate(first.startAt)} – ${formatDate(last.startAt)} · ${occurrences.length} ${nouns}`
              : `No ${nouns} yet`}
          </MetaItem>
          <MetaItem icon={MapPinIcon}>
            {series.venueName ?? <span className="text-muted-foreground">No venue</span>}
          </MetaItem>
          {series.host ? <MetaItem icon={BuildingsIcon}>{series.host}</MetaItem> : null}
        </>
      }
    />
  );
}

function EventGroupNav({ activeTab }: { activeTab: EventGroupTabId }) {
  const { groupId, data } = useEventGroup();
  const dayCount = data?.occurrences.length ?? 0;
  const positionCount = data?.series.positionTemplates?.length ?? 0;
  function badgeFor(tab: EventGroupTabId) {
    const count = tab === "days" ? dayCount : tab === "positions" ? positionCount : 0;
    if (count === 0) return null;
    return <span className="bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{count}</span>;
  }
  return (
    <PageTabs
      label="Group sections"
      tabs={EVENT_GROUP_TABS.map((tab) => ({
        href: getEventGroupTabPath(groupId, tab),
        label: EVENT_GROUP_TAB_LABELS[tab],
        icon: TAB_ICONS[tab],
        active: tab === activeTab,
        badge: badgeFor(tab),
      }))}
    />
  );
}

function EventGroupPanel({ activeTab }: { activeTab: EventGroupTabId }) {
  const { groupId, data, kind } = useEventGroup();
  if (!data) return null;
  const { series, occurrences } = data;
  switch (activeTab) {
    case "days":
      return <EventGroupDaysTab />;
    case "run-of-show":
      return (
        <EventSeriesScheduleEditor
          seriesId={groupId}
          kind={kind}
          anchorStartAt={series.anchorStartAt}
          anchorEndAt={series.anchorEndAt}
          eventType={series.eventType}
          rentalFulfillmentMode={series.rentalFulfillmentMode}
          blockTemplates={series.blockTemplates}
          occurrences={occurrences}
          onMessage={notify.success}
        />
      );
    case "crew":
      return (
        <EventSeriesShiftEditor
          seriesId={groupId}
          kind={kind}
          anchorStartAt={series.anchorStartAt}
          anchorEndAt={series.anchorEndAt}
          eventType={series.eventType}
          rentalFulfillmentMode={series.rentalFulfillmentMode}
          blockTemplates={series.blockTemplates}
          shiftTemplates={series.shiftTemplates}
          occurrences={occurrences}
          onMessage={notify.success}
        />
      );
    case "positions":
      return (
        <EventSeriesPositionEditor
          seriesId={groupId}
          kind={kind}
          positionTemplates={series.positionTemplates}
          occurrences={occurrences}
          onMessage={notify.success}
        />
      );
    case "budget":
      return <EventGroupBudgetTab />;
  }
}

/**
 * The event group page: a recurring series or a multi-day booking. Tabs are
 * routes under `/dashboard/events/series/<id>`; the layout renders this and the
 * route pages render nothing (same as the event page).
 */
export function EventGroupWorkspace({ groupId }: { groupId: Id<"eventSeries"> }) {
  const pathname = usePathname();
  const data = useQuery(api.eventSeries.get, { id: groupId });
  const activeTab = activeGroupTabFromPathname(pathname, groupId);

  if (data === undefined) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (data === null) {
    return <p className="text-sm text-status-rose-700">Event group not found.</p>;
  }

  return (
    <EventGroupContext.Provider value={{ groupId, data, kind: eventGroupKind(data.series) }}>
      <div className="space-y-4 pb-24" data-testid="event-group-workspace">
        <EventGroupHeader />
        <EventGroupNav activeTab={activeTab} />
        <EventGroupPanel activeTab={activeTab} />
      </div>
    </EventGroupContext.Provider>
  );
}

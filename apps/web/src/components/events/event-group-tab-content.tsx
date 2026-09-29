"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notify } from "@/lib/notify";
import { formatEventStatusLabel, normalizeEventStatus } from "@/lib/event-status";
import { formatOccurrencePreview } from "@/lib/event-series";
import { EventSeriesCostsCard } from "@/components/events/event-series-costs-card";
import { EventSeriesScheduleEditor } from "@/components/events/event-series-schedule-editor";
import { EventSeriesShiftEditor } from "@/components/events/event-series-shift-editor";
import { EventSeriesPositionEditor } from "@/components/events/event-series-position-editor";
import type { EventGroupTabId } from "@/lib/event-group-tabs";

/** One tab of the group page; reads the group and renders the matching panel. */
export function EventGroupTabContent({
  groupId,
  tab,
}: {
  groupId: Id<"eventSeries">;
  tab: EventGroupTabId;
}) {
  const data = useQuery(api.eventGroups.get, { id: groupId });

  if (data === undefined) {
    return <p className="text-sm text-muted-foreground">Loading group…</p>;
  }
  if (!data) {
    return <p className="text-sm text-status-rose-700">Event group not found.</p>;
  }

  const { group, days } = data;
  const occurrences = days.map((day) => ({
    _id: day._id,
    occurrenceIndex: day.occurrenceIndex,
    startAt: day.startAt,
  }));

  switch (tab) {
    case "schedule":
      return (
        <EventSeriesScheduleEditor
          seriesId={groupId}
          anchorStartAt={group.anchorStartAt}
          anchorEndAt={group.anchorEndAt}
          eventType={group.eventType}
          rentalFulfillmentMode={group.rentalFulfillmentMode}
          blockTemplates={group.blockTemplates}
          occurrences={occurrences}
          onMessage={notify.success}
        />
      );
    case "crew":
      return (
        <EventSeriesShiftEditor
          seriesId={groupId}
          anchorStartAt={group.anchorStartAt}
          anchorEndAt={group.anchorEndAt}
          eventType={group.eventType}
          rentalFulfillmentMode={group.rentalFulfillmentMode}
          blockTemplates={group.blockTemplates}
          shiftTemplates={group.shiftTemplates}
          occurrences={occurrences}
          onMessage={notify.success}
          billableOccurrenceCount={days.length}
        />
      );
    case "positions":
      return (
        <EventSeriesPositionEditor
          seriesId={groupId}
          positionTemplates={group.positionTemplates}
          occurrences={occurrences}
          onMessage={notify.success}
        />
      );
    case "budget":
      return <EventSeriesCostsCard seriesId={groupId} series={group} />;
    case "days":
    default:
      return <EventGroupDays days={days} />;
  }
}

function EventGroupDays({ days }: { days: Array<{ _id: Id<"events">; occurrenceIndex?: number; startAt: number; status: string; venueName?: string }> }) {
  return (
    <Card data-testid="event-group-days">
      <CardHeader>
        <CardTitle>Days</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {days.length === 0 ? (
          <div className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No days yet.
          </div>
        ) : (
          <table className="w-full min-w-table-lg text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Venue</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day, index) => (
                <tr key={day._id} className="border-b last:border-b-0">
                  <td className="px-2 py-2">{index + 1}</td>
                  <td className="px-2 py-2">{formatOccurrencePreview(day.startAt)}</td>
                  <td className="px-2 py-2">
                    {formatEventStatusLabel(normalizeEventStatus(day.status))}
                  </td>
                  <td className="px-2 py-2">{day.venueName ?? "—"}</td>
                  <td className="px-2 py-2">
                    <Button asChild type="button" variant="outline" size="sm">
                      <Link href={`/dashboard/events/${day._id}`}>Open event</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

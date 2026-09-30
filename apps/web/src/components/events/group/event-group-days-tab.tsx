"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { CalendarDotsIcon, PlusIcon } from "@phosphor-icons/react";
import { toPacificDateTimeInput, pacificDateAndTimeToMs } from "@arbor/format";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { StatusPill } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { formatDate, formatTime, formatUsd } from "@/lib/format";
import {
  eventStatusBadgeTone,
  formatEventStatusLabel,
  normalizeEventStatus,
} from "@/lib/event-status";
import { formatOccurrencePreview, groupDayLabel, groupDayNoun } from "@/lib/event-series";
import { useEventGroup } from "@/components/events/group/event-group-context";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** The group's days in order, with crew and cost per day, plus add/cancel actions. */
export function EventGroupDaysTab() {
  const { groupId, data, kind } = useEventGroup();
  const { confirm } = useAppDialog();
  const addOccurrences = useMutation(api.eventSeries.addOccurrences);
  const addDay = useMutation(api.eventSeries.addDay);
  const cancelFuture = useMutation(api.eventSeries.cancelFuture);
  const [additionalCount, setAdditionalCount] = useState("5");
  const [cancelFromIndex, setCancelFromIndex] = useState("");
  const [newDayDate, setNewDayDate] = useState("");

  if (!data) return null;
  const { series, occurrences } = data;
  const multiDay = kind === "multi_day";
  const noun = groupDayNoun(kind);
  const nouns = groupDayNoun(kind, true);
  const crewConfirmed = occurrences.filter((row) => row.isCrewConfirmed).length;
  const cancelled = occurrences.filter(
    (row) => normalizeEventStatus(row.status) === "cancelled",
  ).length;
  const detached = occurrences.filter((row) => row.seriesDetached).length;
  const summary = [
    plural(occurrences.length, noun, nouns),
    `${crewConfirmed} fully staffed`,
    cancelled > 0 ? `${cancelled} cancelled` : null,
    detached > 0 ? `${detached} detached from the template` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function handleAddOccurrences() {
    const count = Number(additionalCount);
    if (!Number.isInteger(count) || count < 1) {
      notify.error("Enter how many occurrences to add.");
      return;
    }
    try {
      await addOccurrences({ id: groupId, additionalCount: count });
      notify.success(`Added ${plural(count, "occurrence", "occurrences")}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Failed to add occurrences."));
    }
  }

  async function handleAddDay() {
    // A new day starts at Day 1's time of day; its template times follow.
    const time = toPacificDateTimeInput(series.anchorStartAt).slice(11);
    const startAt = newDayDate ? pacificDateAndTimeToMs(newDayDate, time) : null;
    if (startAt == null) {
      notify.error("Pick the new day's date.");
      return;
    }
    try {
      await addDay({ id: groupId, startAt });
      setNewDayDate("");
      notify.success(`Added ${formatDate(startAt)} to the booking.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Failed to add the day."));
    }
  }

  async function handleCancelFrom() {
    const fromIndex = Number(cancelFromIndex);
    const from = occurrences.find((row) => (row.occurrenceIndex ?? 0) === fromIndex);
    if (!cancelFromIndex || !from) {
      notify.error(`Pick the first ${noun} to cancel.`);
      return;
    }
    const shouldCancel = await confirm({
      title: `Cancel ${groupDayLabel(kind, fromIndex)} and every later ${noun}?`,
      description: `Each ${noun} from ${formatDate(from.startAt)} on is marked cancelled. Earlier ${nouns} are not changed.`,
      confirmLabel: `Cancel ${nouns}`,
      destructive: true,
    });
    if (!shouldCancel) return;
    try {
      const result = await cancelFuture({ id: groupId, fromOccurrenceIndex: fromIndex });
      notify.success(`Cancelled ${plural(result.cancelledCount, noun, nouns)}.`);
      setCancelFromIndex("");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, `Failed to cancel ${nouns}.`));
    }
  }

  return (
    <div className="space-y-4" data-testid="event-group-days">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <CalendarDotsIcon className="size-4 text-muted-foreground" aria-hidden />
              {multiDay ? "Days" : "Occurrences"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {`In date order. Each ${noun} has its own crew, lineup and pull list; templates apply to every ${noun} that isn't detached or cancelled.`}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm" data-testid="event-group-days-summary">
            {summary}
          </p>
          {occurrences.length === 0 ? (
            <div className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No {nouns} yet. {multiDay ? "Add a day below." : "Add occurrences below."}
            </div>
          ) : (
            <ul className="border" data-testid="event-group-day-list">
              {occurrences.map((row) => {
                const status = normalizeEventStatus(row.status);
                const crew =
                  row.totalShifts === 0
                    ? "No crew slots"
                    : row.isCrewConfirmed
                      ? "Fully staffed"
                      : `${row.assignedShifts}/${row.totalShifts} crew slots filled`;
                return (
                  <li
                    key={row._id}
                    className="flex items-center gap-2 border-b text-sm last:border-b-0"
                    data-testid="event-group-day-row"
                  >
                    <Link
                      href={`/dashboard/events/${row._id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-muted/30"
                    >
                      <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                        {groupDayLabel(kind, row.occurrenceIndex)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                          {formatTime(row.startAt)}
                        </span>
                        <span className="block truncate font-medium">{formatDate(row.startAt)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {multiDay ? `${row.title} · ${crew}` : crew}
                        </span>
                      </span>
                      {row.seriesDetached ? (
                        <span
                          className="rounded-md bg-status-amber-500/15 px-2 py-0.5 text-xs text-status-amber-700"
                          title="Edited on its own; template applies skip it"
                        >
                          Detached
                        </span>
                      ) : null}
                      <span className="hidden w-24 text-right tabular-nums md:block">
                        {formatUsd(row.costSummary.totalUsd)}
                      </span>
                      <span className="w-28 text-right">
                        <StatusPill tone={eventStatusBadgeTone(status)}>
                          {formatEventStatusLabel(status)}
                        </StatusPill>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlusIcon className="size-4 text-muted-foreground" aria-hidden />
            {multiDay ? "Add or cancel days" : "Add or cancel occurrences"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {multiDay ? (
            <div className="space-y-2">
              <Label id="group-add-day-label">Add a day</Label>
              <div className="flex gap-2" role="group" aria-labelledby="group-add-day-label">
                <DatePickerField
                  value={newDayDate}
                  onChange={setNewDayDate}
                  placeholder="Pick a date"
                  className="flex-1"
                />
                <Button type="button" onClick={() => void handleAddDay()} disabled={!newDayDate}>
                  Add day
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Starts at Day 1&apos;s time ({formatTime(series.anchorStartAt)}) and gets the
                booking&apos;s templates. It joins the booking&apos;s invoice.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="group-add-occurrences">Add occurrences</Label>
              <div className="flex gap-2">
                <Input
                  id="group-add-occurrences"
                  type="number"
                  min={1}
                  value={additionalCount}
                  onChange={(event) => setAdditionalCount(event.target.value)}
                />
                <Button type="button" onClick={() => void handleAddOccurrences()}>
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Continues the rule after the last occurrence, with the series templates.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label id="group-cancel-from-label">Cancel from</Label>
            <div className="flex gap-2" role="group" aria-labelledby="group-cancel-from-label">
              <div className="min-w-0 flex-1">
                <SearchableSelect
                  value={cancelFromIndex}
                  onChange={setCancelFromIndex}
                  options={occurrences.map((row) => ({
                    value: String(row.occurrenceIndex ?? 0),
                    label: `${groupDayLabel(kind, row.occurrenceIndex)} · ${formatOccurrencePreview(row.startAt)}`,
                  }))}
                  placeholder={`Select ${noun}...`}
                  emptyLabel={`Select ${noun}`}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!cancelFromIndex}
                onClick={() => void handleCancelFrom()}
              >
                Cancel {nouns}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

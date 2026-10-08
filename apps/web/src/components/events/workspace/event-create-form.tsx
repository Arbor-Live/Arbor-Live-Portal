"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CalendarPlusIcon,
  EyeIcon,
  MapPinIcon,
  RepeatIcon,
  ShapesIcon,
  TextTIcon,
  TruckIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimeRangePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { VenuePicker } from "@/components/venues/venue-picker";
import { UserSelect } from "@/components/users/user-select";
import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";
import { assignableCrewSelectOptions } from "@/lib/user-select-description";
import { EVENT_VISIBILITY_OPTIONS, type EventVisibility } from "@/lib/event-visibility";
import { localDateTimeInputToMs } from "@/lib/crew-availability";
import {
  ACADEMIC_SKIP_OPTIONS,
  buildOccurrencePreview,
  formatOccurrencePreview,
  quarterClassesEndFor,
  type OccurrencePreviewRow,
  type RecurrenceEndMode,
} from "@/lib/event-series";
import { pacificEndOfDayMs, type AcademicSkipMode } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import {
  EMPTY_EVENT_DRAFT,
  FULFILLMENT_OPTIONS,
  RENTAL_EVENT_TYPES,
  type EventDraft,
  type RentalFulfillmentMode,
} from "@/components/events/workspace/event-draft";
import { EventTypeSelect, Field } from "@/components/events/workspace/event-fields";
import { PrimaryHostSelect, useHostGroupOptions } from "@/components/events/workspace/host-fields";

function seriesEndDateToMs(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (![year, month, day].every((n) => Number.isFinite(n))) return undefined;
  return pacificEndOfDayMs(year, month, day);
}

/**
 * Focused create flow: only what an event needs to exist. Everything else —
 * schedule, crew, equipment, billing — lives in the event workspace once it's saved.
 */
export function EventCreateForm() {
  const router = useRouter();
  const shell = useSessionShell();
  const viewer = useSessionViewer();
  const account = shell?.account;
  const createEvent = useMutation(api.events.create);
  const createEventSeries = useMutation(api.eventSeries.create);
  const managerList = useQuery(api.invoices.listManagers, {});
  const hostGroupOptions = useHostGroupOptions();

  const [draft, setDraft] = useState<EventDraft>(EMPTY_EVENT_DRAFT);
  const [isRecurring, setIsRecurring] = useState(false);
  const [intervalWeeks, setIntervalWeeks] = useState("1");
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<RecurrenceEndMode>("count");
  const [occurrenceCount, setOccurrenceCount] = useState("10");
  const [seriesEndAt, setSeriesEndAt] = useState("");
  const [academicSkip, setAcademicSkip] = useState<AcademicSkipMode | "none">("breaks");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // Board "+" links pass `?date=YYYY-MM-DD`; default that day to a 6pm–10pm show.
    const dateParam = new URLSearchParams(window.location.search).get("date")?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time default from the URL after mount
    setDraft((prev) => ({ ...prev, startAt: `${dateParam}T18:00`, endAt: `${dateParam}T22:00` }));
  }, []);

  function update(patch: Partial<EventDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  const viewerUserId = viewer?.userId;
  const userSelectOptions = useMemo(
    () =>
      assignableCrewSelectOptions(
        managerList,
        viewerUserId
          ? {
              id: viewerUserId,
              name: account?.name ?? account?.email ?? "Current user",
              email: account?.email,
              avatarUrl: account?.avatarUrl,
              image: account?.image,
            }
          : null,
      ),
    [account, managerList, viewerUserId],
  );

  const academicSkipMode = academicSkip === "none" ? undefined : academicSkip;
  const recurrencePreview = useMemo(() => {
    const empty = [] as OccurrencePreviewRow[];
    if (!isRecurring || !draft.startAt) return { rows: empty, keptCount: 0, error: null as string | null };
    try {
      const anchorStartAt = localDateTimeInputToMs(draft.startAt);
      if (anchorStartAt == null) return { rows: empty, keptCount: 0, error: "Invalid start time." };
      const parsedInterval = Number(intervalWeeks);
      if (!Number.isFinite(parsedInterval) || parsedInterval < 1) {
        return { rows: empty, keptCount: 0, error: "Interval must be at least 1 week." };
      }
      const rows = buildOccurrencePreview({
        anchorStartAt,
        intervalWeeks: parsedInterval,
        occurrenceCount: recurrenceEndMode === "count" ? Number(occurrenceCount || "0") : undefined,
        seriesEndAt:
          recurrenceEndMode === "date" && seriesEndAt ? seriesEndDateToMs(seriesEndAt) : undefined,
        academicSkipMode,
      });
      return { rows, keptCount: rows.filter((row) => !row.skipped).length, error: null };
    } catch (error) {
      return {
        rows: empty,
        keptCount: 0,
        error: error instanceof Error ? error.message : "Invalid recurrence settings.",
      };
    }
  }, [
    isRecurring,
    draft.startAt,
    intervalWeeks,
    recurrenceEndMode,
    occurrenceCount,
    seriesEndAt,
    academicSkipMode,
  ]);
  const quarterEnd = draft.startAt ? quarterClassesEndFor(draft.startAt.slice(0, 10)) : null;

  const showFulfillment = RENTAL_EVENT_TYPES.includes(draft.eventType);
  const createLabel = isRecurring ? "Create series" : "Create event";

  async function submit() {
    if (creating) return;
    const startAt = localDateTimeInputToMs(draft.startAt);
    const endAt = localDateTimeInputToMs(draft.endAt);
    if (!draft.title.trim() || startAt == null || endAt == null) {
      notify.error("Title, start, and end are required.");
      return;
    }
    if (isRecurring && (recurrencePreview.error || recurrencePreview.keptCount === 0)) {
      notify.error(
        recurrencePreview.error ?? "Add valid recurrence settings to preview at least one occurrence.",
      );
      return;
    }
    const shared = {
      title: draft.title.trim(),
      startAt,
      endAt,
      venueId: draft.venueId ? (draft.venueId as Id<"venues">) : undefined,
      eventType: draft.eventType,
      rentalFulfillmentMode: showFulfillment ? draft.rentalFulfillmentMode : undefined,
      hostGroupId: draft.hostGroupId ? (draft.hostGroupId as Id<"invoiceGroups">) : undefined,
      eventManagerUserId: draft.managerUserId || undefined,
    };
    setCreating(true);
    try {
      if (isRecurring) {
        const result = await createEventSeries({
          ...shared,
          intervalWeeks: Number(intervalWeeks),
          occurrenceCount: recurrenceEndMode === "count" ? Number(occurrenceCount || "0") : undefined,
          seriesEndAt:
            recurrenceEndMode === "date" && seriesEndAt ? seriesEndDateToMs(seriesEndAt) : undefined,
          academicSkipMode,
        });
        router.replace(`/dashboard/events/${result.firstEventId}`);
        return;
      }
      const id = await createEvent({ ...shared, visibility: draft.visibility });
      router.replace(`/dashboard/events/${id}`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn’t create the event."));
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href="/dashboard/events">
          <ArrowLeftIcon />
          Events
        </Link>
      </Button>
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarPlusIcon className="size-5 text-primary" />
            Create event
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Start with the essentials. Schedule, crew, equipment, and billing come after it&apos;s saved.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Title" icon={TextTIcon} className="md:col-span-2">
            <Input
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
              placeholder="e.g. Spring Showcase"
              autoFocus
            />
          </Field>
          <Field label="Event type" icon={ShapesIcon}>
            <EventTypeSelect value={draft.eventType} onChange={(eventType) => update({ eventType })} />
          </Field>
          {showFulfillment ? (
            <Field label="Fulfillment" icon={TruckIcon}>
              <SearchableSelect
                value={draft.rentalFulfillmentMode}
                onChange={(value) => update({ rentalFulfillmentMode: value as RentalFulfillmentMode })}
                options={FULFILLMENT_OPTIONS}
                placeholder="Search fulfillment..."
              />
            </Field>
          ) : (
            <div className="hidden md:block" />
          )}
          <Field label="When" icon={CalendarBlankIcon}>
            <DateTimeRangePicker
              startValue={draft.startAt}
              endValue={draft.endAt}
              onChange={({ start, end }) => update({ startAt: start, endAt: end })}
              placeholder="Select start and end"
            />
          </Field>
          <Field label="Venue" icon={MapPinIcon}>
            <VenuePicker
              value={draft.venueId}
              onChange={(venueId) => update({ venueId })}
              allowCreate
            />
          </Field>
          <Field label="Host" icon={BuildingsIcon}>
            <PrimaryHostSelect
              value={draft.hostGroupId}
              onChange={(hostGroupId) => update({ hostGroupId })}
              options={hostGroupOptions}
              allowCreate
            />
          </Field>
          <Field label="Event manager" icon={UserCircleIcon}>
            <UserSelect
              value={draft.managerUserId}
              onChange={(managerUserId) => update({ managerUserId })}
              options={userSelectOptions}
              emptyLabel="Select event manager"
              clearable
            />
          </Field>
          {!isRecurring ? (
            <Field
              label="Visibility"
              icon={EyeIcon}
              hint="Public events appear on the marketing site."
            >
              <SearchableSelect
                value={draft.visibility}
                onChange={(value) => update({ visibility: value as EventVisibility })}
                options={EVENT_VISIBILITY_OPTIONS}
                placeholder="Search visibility..."
              />
            </Field>
          ) : null}

          <div className="space-y-3 border-t pt-4 md:col-span-2">
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
              <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
              <RepeatIcon className="size-4 text-muted-foreground" />
              Recurring event series
            </label>
            {isRecurring ? (
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Repeat every">
                  <SearchableSelect
                    value={intervalWeeks}
                    onChange={setIntervalWeeks}
                    options={[
                      { value: "1", label: "Weekly" },
                      { value: "2", label: "Every 2 weeks" },
                      { value: "3", label: "Every 3 weeks" },
                      { value: "4", label: "Every 4 weeks" },
                    ]}
                    placeholder="Interval..."
                  />
                </Field>
                <Field label="Ends">
                  <SearchableSelect
                    value={recurrenceEndMode}
                    onChange={(value) => setRecurrenceEndMode(value as RecurrenceEndMode)}
                    options={[
                      { value: "count", label: "After N occurrences" },
                      { value: "date", label: "On end date" },
                    ]}
                    placeholder="End mode..."
                  />
                </Field>
                {recurrenceEndMode === "count" ? (
                  <Field label="Occurrence count" hint="A quarter is typically about 10 weeks.">
                    <Input
                      type="number"
                      min={1}
                      value={occurrenceCount}
                      onChange={(event) => setOccurrenceCount(event.target.value)}
                    />
                  </Field>
                ) : (
                  <Field label="Series end date">
                    <Input
                      type="date"
                      value={seriesEndAt}
                      onChange={(event) => setSeriesEndAt(event.target.value)}
                    />
                    {quarterEnd ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-0"
                        onClick={() => setSeriesEndAt(quarterEnd.lastClassDate)}
                      >
                        End with {quarterEnd.quarter.label} classes
                      </Button>
                    ) : null}
                  </Field>
                )}
                <Field
                  label="Stanford calendar"
                  className="md:col-span-3"
                  hint="Arbor is closed winter break, spring break, and summer. Skipped weeks don't count toward the occurrence count."
                >
                  <SearchableSelect
                    value={academicSkip}
                    onChange={(value) => setAcademicSkip(value as AcademicSkipMode | "none")}
                    options={ACADEMIC_SKIP_OPTIONS}
                    placeholder="Academic calendar..."
                  />
                </Field>
                <div className="space-y-2 md:col-span-3">
                  <p className="text-sm font-medium">
                    Preview ({recurrencePreview.keptCount} occurrences)
                  </p>
                  {recurrencePreview.error ? (
                    <p className="text-sm text-status-rose-700">{recurrencePreview.error}</p>
                  ) : (
                    <ul className="max-h-40 divide-y overflow-y-auto border text-sm">
                      {recurrencePreview.rows.map((row) => (
                        <li
                          key={row.occurrenceIndex}
                          className={cn(
                            "flex items-center justify-between gap-2 px-3 py-2",
                            row.skipped && "text-muted-foreground",
                          )}
                        >
                          <span className={cn(row.skipped && "line-through")}>
                            {formatOccurrencePreview(row.startAt)}
                          </span>
                          {row.note ? (
                            <span
                              className={cn(
                                "text-xs",
                                row.skipped ? "text-muted-foreground" : "text-status-amber-700",
                              )}
                            >
                              {row.skipped ? `Skipped · ${row.note.label}` : row.note.label}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Crew scheduling stays separate for each generated occurrence.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
        <div className="flex items-center justify-end gap-2 border-t px-4 pt-4">
          <Button asChild variant="outline">
            <Link href="/dashboard/events">Cancel</Link>
          </Button>
          <Button type="button" disabled={creating} onClick={() => void submit()}>
            {isRecurring ? <RepeatIcon /> : <CalendarPlusIcon />}
            {creating ? "Creating…" : createLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}

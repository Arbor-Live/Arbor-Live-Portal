"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { CaretDownIcon, ClockIcon, CopyIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { EventSeriesShiftEditor } from "@/components/events/event-series-shift-editor";
import { LinkedEventDaySwitcher } from "@/components/events/linked-event-day-switcher";
import { InvoiceLinkedEventCrewSection } from "@/components/financial/invoice-linked-event-crew";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";
import { crewLineRateUsd, isBillableCrewRow, type CrewRow } from "./invoice-draft-model";
import {
  AmountCell,
  LineColumnHeads,
  LineGroup,
  LineRow,
  StaticCell,
  patchRow,
  plural,
  removeRow,
} from "./line-items-layout";
import type { InvoiceDraft } from "./use-invoice-draft";

function crewRateOf(draft: InvoiceDraft) {
  const { crewRateMode, customCrewRateUsd } = draft.fields;
  return (row: CrewRow) => crewLineRateUsd(row, crewRateMode, customCrewRateUsd, draft.settings);
}

function sumHours(rows: CrewRow[]) {
  return rows.filter(isBillableCrewRow).reduce((total, row) => total + Number(row.quantity), 0);
}

function sumAmount(rows: CrewRow[], rateOf: (row: CrewRow) => number) {
  return rows.filter(isBillableCrewRow).reduce((total, row) => total + Number(row.quantity) * rateOf(row), 0);
}

/** Whether crew comes from a linked event or series schedule (vs. hand-entered rows). */
export function hasLinkedCrewSchedule(draft: InvoiceDraft) {
  return Boolean(draft.linkedSeries || draft.linkedEvent);
}

/** New hand-entered crew row: custom-rate quotes start at the custom rate. */
export function emptyCrewRow(draft: InvoiceDraft, source?: "manual"): CrewRow {
  const { crewRateMode, customCrewRateUsd } = draft.fields;
  return {
    label: "",
    quantity: "1",
    rateUsd: crewRateMode === "custom" ? customCrewRateUsd || "0" : undefined,
    ...(source ? { source } : {}),
  };
}

/**
 * Editable crew rows: every crew line on an unlinked quote, or the extra
 * billable hours on top of a linked schedule.
 */
function ManualCrewRows({
  draft,
  rows,
  setRows,
  kind,
}: {
  draft: InvoiceDraft;
  rows: CrewRow[];
  setRows: (updater: (rows: CrewRow[]) => CrewRow[]) => void;
  kind: "crew" | "hours";
}) {
  const rateOf = crewRateOf(draft);
  const custom = draft.fields.crewRateMode === "custom";
  return (
    <>
      <LineColumnHeads item={kind === "crew" ? "Role" : "Description"} qty="Hours" rate="Rate / hr" />
      {rows.map((row, idx) => (
        <LineRow
          key={`${kind}-${idx}`}
          testId={`invoice-row-${kind}-${idx}`}
          removeLabel={`Remove ${row.label.trim() || (kind === "crew" ? "crew line" : "hours")}`}
          onRemove={() => setRows((prev) => removeRow(prev, idx))}
        >
          <Input
            aria-label={kind === "crew" ? "Crew role" : "Description"}
            placeholder={kind === "crew" ? "Crew role" : "Description"}
            value={row.label}
            onChange={(event) => setRows((prev) => patchRow(prev, idx, { label: event.target.value }))}
          />
          <Input
            aria-label="Hours"
            placeholder={kind === "crew" ? "Qty/hours" : "Hours"}
            inputMode="decimal"
            value={row.quantity}
            onChange={(event) => setRows((prev) => patchRow(prev, idx, { quantity: event.target.value }))}
          />
          {custom ? (
            <Input
              aria-label="Rate per hour"
              placeholder="Rate (USD)"
              inputMode="decimal"
              value={row.rateUsd ?? "0"}
              onChange={(event) => setRows((prev) => patchRow(prev, idx, { rateUsd: event.target.value }))}
            />
          ) : (
            <StaticCell
              title={
                row.rateMode === "lead"
                  ? "Lead rate for this assignee"
                  : row.userId
                    ? "Assignee compensation rate"
                    : "Open-slot / invoice default rate"
              }
            >
              {formatUsd(rateOf(row))}
            </StaticCell>
          )}
          <AmountCell amountUsd={(Number(row.quantity) || 0) * rateOf(row)} />
        </LineRow>
      ))}
    </>
  );
}

/**
 * Crew. On a linked event or series the lines come from its Run of Show
 * (read-only here; the schedule editor sits collapsed under them). On an
 * unlinked quote they're typed in.
 */
export function CrewLines({ draft }: { draft: InvoiceDraft }) {
  const rateOf = crewRateOf(draft);
  const linked = hasLinkedCrewSchedule(draft);
  const rows = draft.lines.crewRows;

  if (!linked) {
    if (rows.length === 0) return null;
    return (
      <LineGroup
        icon={UsersThreeIcon}
        title="Crew"
        detail={`${plural(sumHours(rows), "hr", "hrs")} · ${crewRateDetail(draft)}`}
        subtotalUsd={draft.draftTotals.crewSubtotalUsd}
        subtotalTestId="invoice-total-crew"
        testId="invoice-group-crew"
      >
        <ManualCrewRows draft={draft} rows={rows} setRows={draft.setCrewRows} kind="crew" />
      </LineGroup>
    );
  }

  const scheduleRows = rows.filter((row) => row.source !== "manual");
  return (
    <LineGroup
      icon={UsersThreeIcon}
      title="Crew"
      detail={`${plural(sumHours(scheduleRows), "hr", "hrs")} from the ${draft.linkedSeries ? "series" : "run of show"}`}
      subtotalUsd={sumAmount(scheduleRows, rateOf)}
      subtotalTestId="invoice-total-crew"
      testId="invoice-group-crew"
    >
      {scheduleRows.length > 0 ? (
        <>
          <LineColumnHeads item="Shift" qty="Hours" rate="Rate / hr" />
          {scheduleRows.map((row, idx) => (
            <LineRow key={`crew-schedule-${idx}`} testId={`invoice-row-crew-schedule-${idx}`}>
              <p className="truncate pt-1.5">{row.label || "Crew"}</p>
              <StaticCell>{Number(row.quantity) || 0} hrs</StaticCell>
              <StaticCell>{formatUsd(rateOf(row))}</StaticCell>
              <AmountCell amountUsd={(Number(row.quantity) || 0) * rateOf(row)} />
            </LineRow>
          ))}
        </>
      ) : (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          No crew shifts on the {draft.linkedSeries ? "series template" : "run of show"} yet. Add them in the schedule
          below.
        </p>
      )}
      <CrewScheduleEditor draft={draft} />
    </LineGroup>
  );
}

function crewRateDetail(draft: InvoiceDraft) {
  const mode = draft.fields.crewRateMode;
  if (mode === "custom") return "custom rate per row";
  return `open slots at ${formatUsd(draft.defaultCrewHourlyRateUsd)}/hr`;
}

/**
 * The linked Run of Show / series shift template, collapsed under the Crew
 * rows. It stays mounted while collapsed: it's what reports crew edits back
 * to the quote.
 */
function CrewScheduleEditor({ draft }: { draft: InvoiceDraft }) {
  const { confirm } = useAppDialog();
  const copyDaySetup = useMutation(api.events.copyDaySetup);
  const [open, setOpen] = useState(false);
  const [copyingDaySetup, setCopyingDaySetup] = useState(false);
  const { linkedSeries, linkedEvent, linkedDayEvents, selectedDayEventId, seriesCostData, billableOccurrenceCount } =
    draft;

  async function handleCopyDaySetupToOtherDays() {
    if (!selectedDayEventId || linkedDayEvents.length < 2) return;
    const confirmed = await confirm({
      title: "Copy this day's setup to the other linked days?",
      description:
        "Copies crew hours (open slots only, not assigned people) and equipment pull/checkout quantities. Existing schedule slots and pull-list rows on those days will be replaced.",
      confirmLabel: "Copy setup",
    });
    if (!confirmed) return;
    setCopyingDaySetup(true);
    try {
      const result = await copyDaySetup({ sourceEventId: selectedDayEventId });
      draft.invalidateCrewBuckets();
      notify.success(
        `Copied setup to ${result.copiedToEventIds.length} other day${result.copiedToEventIds.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setCopyingDaySetup(false);
    }
  }

  let body: React.ReactNode;
  if (linkedSeries) {
    body =
      seriesCostData === undefined ? (
        <p className="text-sm text-muted-foreground">Loading series crew template…</p>
      ) : seriesCostData?.series ? (
        <EventSeriesShiftEditor
          embedded
          seriesId={linkedSeries.seriesId}
          anchorStartAt={seriesCostData.series.anchorStartAt}
          anchorEndAt={seriesCostData.series.anchorEndAt}
          eventType={seriesCostData.series.eventType}
          rentalFulfillmentMode={seriesCostData.series.rentalFulfillmentMode}
          blockTemplates={seriesCostData.series.blockTemplates}
          shiftTemplates={seriesCostData.series.shiftTemplates}
          occurrences={seriesCostData.occurrences}
          billableOccurrenceCount={billableOccurrenceCount}
          title="Series crew template"
          description={`Crew hours bill as template duration × ${plural(billableOccurrenceCount, "billable occurrence")}. Saving applies empty shifts to each selected occurrence.`}
          onMessage={notify.success}
          onShiftDraftsChange={draft.handleSeriesShiftDraftsChange}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Linked series not found.</p>
      );
  } else if (linkedEvent) {
    body = (
      <div className="space-y-3">
        {linkedDayEvents.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <LinkedEventDaySwitcher
              days={linkedDayEvents.map((day, index) => ({ ...day, dayNumber: index + 1 }))}
              selectedEventId={selectedDayEventId}
              onSelect={draft.selectDay}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedDayEventId || copyingDaySetup}
              onClick={() => void handleCopyDaySetupToOtherDays()}
            >
              <CopyIcon />
              {copyingDaySetup ? "Copying…" : "Copy setup to other days"}
            </Button>
            {selectedDayEventId ? (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={`/dashboard/events/${selectedDayEventId}`}>Open selected day</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {selectedDayEventId ? (
          <InvoiceLinkedEventCrewSection
            key={selectedDayEventId}
            embedded
            eventId={selectedDayEventId}
            defaultCrewHourlyRateUsd={draft.defaultCrewHourlyRateUsd}
            onEventCrewRowsChange={draft.handleEventCrewRowsChange}
            onMessage={notify.success}
          />
        ) : null}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/30"
          data-testid="invoice-crew-schedule-toggle"
        >
          <CaretDownIcon className={open ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} aria-hidden />
          {open ? "Hide" : "Edit"} {linkedSeries ? "series crew template" : "crew schedule"}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent forceMount className="px-3 pb-3 data-[state=closed]:hidden">
        {body}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Extra crew hours on top of a linked schedule (the quote's own rows). */
export function HoursLines({ draft }: { draft: InvoiceDraft }) {
  const rateOf = crewRateOf(draft);
  if (!hasLinkedCrewSchedule(draft)) return null;
  const rows = draft.lines.crewRows.filter((row) => row.source === "manual");
  if (rows.length === 0) return null;
  return (
    <LineGroup
      icon={ClockIcon}
      title="Extra crew hours"
      detail={`${plural(sumHours(rows), "hr", "hrs")} on top of the schedule`}
      subtotalUsd={sumAmount(rows, rateOf)}
      subtotalTestId="invoice-total-hours"
      testId="invoice-group-hours"
    >
      <ManualCrewRows draft={draft} rows={rows} setRows={draft.setManualCrewRows} kind="hours" />
    </LineGroup>
  );
}

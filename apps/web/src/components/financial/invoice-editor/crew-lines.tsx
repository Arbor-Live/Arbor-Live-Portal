"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { CaretDownIcon, ClockIcon, CopyIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { ApplyDaySetupDialog, type ApplyDaySetupArgs } from "@/components/events/apply-day-setup-dialog";
import { EventSeriesShiftEditor } from "@/components/events/event-series-shift-editor";
import { LinkedEventDaySwitcher } from "@/components/events/linked-event-day-switcher";
import { InvoiceLinkedEventCrewSection } from "@/components/financial/invoice-linked-event-crew";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";
import { crewLineRateUsd, crewPersonHours, isBillableCrewRow, type CrewRow } from "./invoice-draft-model";
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
    hours: "1",
    people: "1",
    rateUsd: crewRateMode === "custom" ? customCrewRateUsd || "0" : undefined,
    ...(source ? { source } : {}),
  };
}

/**
 * Editable crew rows: every crew line on an unlinked quote, or the extra
 * billable hours on top of a linked schedule. Each row is one phase at its
 * own headcount (4 on load-in, 2 during, 4 on strike), billed as
 * hours × people.
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
      <LineColumnHeads item={kind === "crew" ? "Role / phase" : "Description"} qty="Hours × people" rate="Rate / person / hr" />
      {rows.map((row, idx) => {
        // Older rows saved only a total: read that as hours for one person.
        const hours = row.hours ?? row.quantity;
        const people = row.people ?? "1";
        const setSplit = (next: { hours?: string; people?: string }) => {
          const split = { hours, people, ...next };
          setRows((prev) => patchRow(prev, idx, { ...split, quantity: crewPersonHours(split.hours, split.people) }));
        };
        return (
        <LineRow
          key={`${kind}-${idx}`}
          testId={`invoice-row-${kind}-${idx}`}
          removeLabel={`Remove ${row.label.trim() || (kind === "crew" ? "crew line" : "hours")}`}
          onRemove={() => setRows((prev) => removeRow(prev, idx))}
        >
          <Input
            aria-label={kind === "crew" ? "Crew role" : "Description"}
            placeholder={kind === "crew" ? "Crew role (e.g. Load-in)" : "Description"}
            value={row.label}
            onChange={(event) => setRows((prev) => patchRow(prev, idx, { label: event.target.value }))}
          />
          <div className="flex items-center gap-1">
            <Input
              aria-label="Hours"
              placeholder="Hours"
              inputMode="decimal"
              className="min-w-0 px-2"
              value={hours}
              onChange={(event) => setSplit({ hours: event.target.value })}
            />
            <span className="text-muted-foreground" aria-hidden>
              ×
            </span>
            <Input
              aria-label="People"
              placeholder="People"
              inputMode="numeric"
              className="min-w-0 px-2"
              value={people}
              onChange={(event) => setSplit({ people: event.target.value })}
            />
          </div>
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
          <AmountCell
            amountUsd={(Number(row.quantity) || 0) * rateOf(row)}
            hint={plural(Number(row.quantity) || 0, "person-hr", "person-hrs")}
          />
        </LineRow>
        );
      })}
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
        detail={`${plural(sumHours(rows), "person-hr", "person-hrs")} · ${crewRateDetail(draft)}`}
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
      detail={`${plural(sumHours(scheduleRows), "person-hr", "person-hrs")} from the ${draft.linkedSeries ? "series" : "run of show"}`}
      subtotalUsd={sumAmount(scheduleRows, rateOf)}
      subtotalTestId="invoice-total-crew"
      testId="invoice-group-crew"
    >
      {scheduleRows.length > 0 ? (
        <>
          <LineColumnHeads item="Phase · role" qty="Hours × people" rate="Rate / person / hr" />
          {groupShiftRows(scheduleRows, rateOf).map((phase, idx) => (
            <LineRow key={phase.key} testId={`invoice-row-crew-schedule-${idx}`}>
              <p className="truncate pt-1.5">{phase.label}</p>
              <StaticCell>
                {phase.hours} hrs × {plural(phase.people, "person", "people")}
              </StaticCell>
              <StaticCell>{formatUsd(phase.rateUsd)}</StaticCell>
              <AmountCell amountUsd={phase.hours * phase.people * phase.rateUsd} />
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

/**
 * The schedule bills one line per shift. Shown here, identical shifts (same
 * phase, role, hours and rate) fold into one row with a headcount, so 4 open
 * load-in slots read as "3 hrs × 4 people". The saved lines don't change.
 */
function groupShiftRows(rows: CrewRow[], rateOf: (row: CrewRow) => number) {
  const phases = new Map<string, { key: string; label: string; hours: number; people: number; rateUsd: number }>();
  for (const row of rows.filter(isBillableCrewRow)) {
    const hours = Number(row.quantity);
    const rateUsd = rateOf(row);
    const key = `${row.label}|${hours}|${rateUsd}`;
    const phase = phases.get(key);
    if (phase) phase.people += 1;
    else phases.set(key, { key, label: row.label, hours, people: 1, rateUsd });
  }
  return [...phases.values()];
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
  const applyDaySetup = useMutation(api.eventSeries.applyDaySetup);
  // Open by default: the schedule is where headcount per phase is set.
  const [open, setOpen] = useState(true);
  const [applySetupOpen, setApplySetupOpen] = useState(false);
  const { linkedSeries, linkedEvent, linkedDayEvents, selectedDayEventId, seriesCostData, billableOccurrenceCount } =
    draft;

  async function handleApplyDaySetup(args: ApplyDaySetupArgs) {
    if (!selectedDayEventId) return false;
    try {
      const result = await applyDaySetup({ eventId: selectedDayEventId, ...args });
      draft.invalidateCrewBuckets();
      notify.success(
        `Applied this day's setup to ${result.updatedCount} other day${result.updatedCount === 1 ? "" : "s"}.`,
      );
      return true;
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
      return false;
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
              disabled={!selectedDayEventId}
              onClick={() => setApplySetupOpen(true)}
            >
              <CopyIcon />
              Apply day setup to other days…
            </Button>
            <ApplyDaySetupDialog
              open={applySetupOpen}
              onOpenChange={setApplySetupOpen}
              kind="multi_day"
              onApply={handleApplyDaySetup}
            />
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
      detail={`${plural(sumHours(rows), "person-hr", "person-hrs")} on top of the schedule`}
      subtotalUsd={sumAmount(rows, rateOf)}
      subtotalTestId="invoice-total-hours"
      testId="invoice-group-hours"
    >
      <ManualCrewRows draft={draft} rows={rows} setRows={draft.setManualCrewRows} kind="hours" />
    </LineGroup>
  );
}

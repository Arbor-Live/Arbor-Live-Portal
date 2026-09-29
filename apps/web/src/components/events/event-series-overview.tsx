"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { useAppDialog } from "@/components/ui/app-dialog";
import { notify } from "@/lib/notify";
import { formatEventStatusLabel, normalizeEventStatus } from "@/lib/event-status";
import { formatOccurrencePreview } from "@/lib/event-series";
import { formatUsd } from "@/lib/format";
import { EventSeriesCostsCard } from "@/components/events/event-series-costs-card";
import { EventSeriesScheduleEditor } from "@/components/events/event-series-schedule-editor";
import { EventSeriesShiftEditor } from "@/components/events/event-series-shift-editor";
import { EventSeriesPositionEditor } from "@/components/events/event-series-position-editor";
import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";

function intervalLabel(weeks: number | undefined) {
  if (weeks === undefined) return "Recurring";
  if (weeks === 1) return "Weekly";
  return `Every ${weeks} weeks`;
}

export function EventSeriesOverview({ seriesId }: { seriesId: Id<"eventSeries"> }) {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const shell = useSessionShell();
  const viewer = useSessionViewer();
  const account = shell?.account;
  const data = useQuery(api.eventSeries.get, { id: seriesId });
  const invoices = useQuery(api.invoices.list, { status: "draft" });
  const addOccurrences = useMutation(api.eventSeries.addOccurrences);
  const cancelFuture = useMutation(api.eventSeries.cancelFuture);
  const endSeries = useMutation(api.eventSeries.endSeries);
  const linkInvoice = useMutation(api.eventSeries.linkInvoice);
  const unlinkInvoice = useMutation(api.eventSeries.unlinkInvoice);
  const createDraftForSeries = useMutation(api.invoices.createDraftForSeries);
  const scaffoldPullList = useMutation(api.eventSeriesPullLists.scaffoldFromInvoice);

  const [invoiceLinkOverride, setInvoiceLinkOverride] = useState<string | null>(null);

  const [additionalCount, setAdditionalCount] = useState("5");
  const [cancelFromIndex, setCancelFromIndex] = useState("0");

  // The "link draft invoice" picker only renders while no invoice is linked;
  // derive its value from the series rather than syncing it in an effect.
  const invoiceLinkId = invoiceLinkOverride ?? (data?.series?.invoiceId ?? "");

  const billableOccurrenceCount = useMemo(() => {
    const rows = data?.occurrences ?? [];
    return rows.filter(
      (row) => !row.seriesDetached && normalizeEventStatus(row.status) !== "cancelled",
    ).length;
  }, [data?.occurrences]);

  const invoiceOptions = useMemo(
    () =>
      (invoices ?? []).map((row) => ({
        value: row._id,
        label: `${row.invoiceNumber} · ${formatUsd(row.totalUsd)}`,
      })),
    [invoices],
  );

  const linkedInvoice = useMemo(() => {
    const id = data?.series?.invoiceId;
    if (!id) return null;
    return (invoices ?? []).find((row) => row._id === id) ?? { _id: id, invoiceNumber: "Linked invoice" };
  }, [data?.series?.invoiceId, invoices]);

  const stats = useMemo(() => {
    const rows = data?.occurrences ?? [];
    const confirmed = rows.filter((row) => row.isCrewConfirmed).length;
    const cancelled = rows.filter((row) => normalizeEventStatus(row.status) === "cancelled").length;
    return { confirmed, cancelled, total: rows.length };
  }, [data?.occurrences]);

  if (data === undefined) {
    return <p className="text-sm text-muted-foreground">Loading series...</p>;
  }

  if (!data || !data.series) {
    return <p className="text-sm text-status-rose-700">Event series not found.</p>;
  }

  const occurrences = data.occurrences;
  const series = data.series;
  const costSummary = data.costSummary;

  async function handleAddOccurrences() {
    try {
      const count = Number(additionalCount);
      if (!Number.isFinite(count) || count < 1) {
        notify.error("Enter a valid occurrence count.");
        return;
      }
      await addOccurrences({ id: seriesId, additionalCount: count });
      notify.success(`Added ${count} occurrence${count === 1 ? "" : "s"}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Failed to add occurrences."));
    }
  }

  async function handleCancelFuture() {
    const fromIndex = Number(cancelFromIndex);
    if (!Number.isFinite(fromIndex) || fromIndex < 0) {
      notify.error("Enter a valid occurrence index.");
      return;
    }
    const shouldCancel = await confirm({
      title: "Cancel future occurrences?",
      description: `Cancel all occurrences from index ${fromIndex} onward?`,
      confirmLabel: "Cancel occurrences",
      destructive: true,
    });
    if (!shouldCancel) return;
    try {
      const result = await cancelFuture({ id: seriesId, fromOccurrenceIndex: fromIndex });
      notify.success(`Cancelled ${result.cancelledCount} occurrence${result.cancelledCount === 1 ? "" : "s"}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Failed to cancel occurrences."));
    }
  }

  async function handleEndSeries() {
    const shouldEnd = await confirm({
      title: "Mark this series as ended?",
      confirmLabel: "End series",
    });
    if (!shouldEnd) return;
    try {
      await endSeries({ id: seriesId });
      notify.success("Series marked as ended.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Failed to end series."));
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>{series.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {intervalLabel(series.intervalWeeks)} · {stats.total} occurrences · status {series.status}
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 text-sm">
          <p>Crew confirmed: {stats.confirmed}</p>
          <p>Cancelled: {stats.cancelled}</p>
          <p>
            First: {formatOccurrencePreview(series.anchorStartAt)}
          </p>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <p className="text-sm text-muted-foreground">
            One invoice can bill the whole series. {billableOccurrenceCount} billable occurrence
            {billableOccurrenceCount === 1 ? "" : "s"}.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {linkedInvoice ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm">
                Linked invoice:{" "}
                <span className="font-medium">
                  {"invoiceNumber" in linkedInvoice ? linkedInvoice.invoiceNumber : "Invoice"}
                </span>
              </p>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href={`/dashboard/financial-hub/invoices/${linkedInvoice._id}`}>Open invoice</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!series.invoiceId}
                onClick={() =>
                  void scaffoldPullList({ seriesId })
                    .then((result) =>
                      notify.success(`Built pull list template from invoice (${result.templateCount} lines).`),
                    )
                    .catch((error) =>
                      notify.error(getConvexErrorMessage(error, "Failed to scaffold pull list.")),
                    )
                }
              >
                Build pull list from invoice
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  void unlinkInvoice({ id: seriesId })
                    .then(() => {
                      setInvoiceLinkOverride(null);
                      notify.success("Invoice unlinked from series.");
                    })
                    .catch((error) =>
                      notify.error(getConvexErrorMessage(error, "Failed to unlink invoice.")),
                    )
                }
              >
                Unlink
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                disabled={!viewer?.userId}
                onClick={() => {
                  const userId = viewer?.userId;
                  if (!userId) return;
                  void createDraftForSeries({
                    seriesId,
                    managerUserId: userId,
                    managerName: account?.name ?? "Manager",
                    managerEmail: account?.email ?? undefined,
                  })
                    .then((result) => {
                      router.push(`/dashboard/financial-hub/invoices/${result.id}`);
                    })
                    .catch((error) =>
                      notify.error(getConvexErrorMessage(error, "Failed to create invoice.")),
                    );
                }}
              >
                Create invoice for series
              </Button>
              <div className="min-w-64 flex-1 space-y-2">
                <Label>Link draft invoice</Label>
                <SearchableSelect
                  value={invoiceLinkId}
                  onChange={setInvoiceLinkOverride}
                  options={invoiceOptions}
                  placeholder="Search invoices..."
                  emptyLabel="Select invoice"
                />
              </div>
              <Button
                type="button"
                disabled={!invoiceLinkId}
                onClick={() =>
                  void linkInvoice({ id: seriesId, invoiceId: invoiceLinkId as Id<"invoices"> })
                    .then(() => {
                      setInvoiceLinkOverride(null);
                      notify.success("Invoice linked to series and all active occurrences.");
                    })
                    .catch((error) =>
                      notify.error(getConvexErrorMessage(error, "Failed to link invoice.")),
                    )
                }
              >
                Link invoice
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Series cost summary</CardTitle>
          <p className="text-sm text-muted-foreground">
            Per-occurrence costs are summed across active events. Series recurring costs apply once to the whole series.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Grand total (actual)</p>
              <p className="text-lg font-semibold">{formatUsd(costSummary.grandTotalUsd)}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Projected total</p>
              <p className="text-lg font-semibold">{formatUsd(costSummary.projectedGrandTotalUsd)}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Avg per occurrence
                {costSummary.activeOccurrenceCount > 0
                  ? ` (${costSummary.activeOccurrenceCount} active)`
                  : ""}
              </p>
              <p className="text-lg font-semibold">
                {formatUsd(costSummary.averageCostPerOccurrenceUsd)}
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Series recurring</p>
              <p className="text-lg font-semibold">{formatUsd(costSummary.seriesRecurring.totalUsd)}</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-5 text-sm">
            <p>Crew (actual): {formatUsd(costSummary.perOccurrence.crewUsd)}</p>
            <p>Crew (budgeted): {formatUsd(costSummary.occurrenceTemplate.projectedBudgetCrewUsd)}</p>
            <p>Artists (events): {formatUsd(costSummary.perOccurrence.bandsUsd)}</p>
            <p>External rentals: {formatUsd(costSummary.perOccurrence.externalRentalsUsd)}</p>
            <p>Other: {formatUsd(costSummary.perOccurrence.otherUsd)}</p>
          </div>
          {costSummary.budgetUsd !== undefined ? (
            <p className="text-sm">
              Budget: {formatUsd(costSummary.budgetUsd)}
              {costSummary.projectedBudgetRemainingUsd !== undefined ? (
                <span
                  className={
                    costSummary.projectedBudgetRemainingUsd >= 0 ? " text-status-emerald-700" : " text-status-rose-700"
                  }
                >
                  {" "}
                  · Projected remaining: {formatUsd(costSummary.projectedBudgetRemainingUsd)}
                </span>
              ) : null}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <EventSeriesCostsCard seriesId={seriesId} series={series} />

      <EventSeriesScheduleEditor
        seriesId={seriesId}
        anchorStartAt={series.anchorStartAt}
        anchorEndAt={series.anchorEndAt}
        eventType={series.eventType}
        rentalFulfillmentMode={series.rentalFulfillmentMode}
        blockTemplates={series.blockTemplates}
        occurrences={occurrences}
        onMessage={notify.success}
      />

      <EventSeriesShiftEditor
        seriesId={seriesId}
        anchorStartAt={series.anchorStartAt}
        anchorEndAt={series.anchorEndAt}
        eventType={series.eventType}
        rentalFulfillmentMode={series.rentalFulfillmentMode}
        blockTemplates={series.blockTemplates}
        shiftTemplates={series.shiftTemplates}
        occurrences={occurrences}
        onMessage={notify.success}
      />

      <EventSeriesPositionEditor
        seriesId={seriesId}
        positionTemplates={series.positionTemplates}
        occurrences={occurrences}
        onMessage={notify.success}
      />

      <Card>
        <CardHeader>
          <CardTitle>Occurrences</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-table-lg text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Crew</th>
                <th className="px-2 py-2">Cost</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map((occurrence) => (
                <tr key={occurrence._id} className="border-b last:border-b-0">
                  <td className="px-2 py-2">{(occurrence.occurrenceIndex ?? 0) + 1}</td>
                  <td className="px-2 py-2">{formatOccurrencePreview(occurrence.startAt)}</td>
                  <td className="px-2 py-2">{formatEventStatusLabel(normalizeEventStatus(occurrence.status))}</td>
                  <td className="px-2 py-2">
                    {occurrence.totalShifts === 0
                      ? "No shifts"
                      : occurrence.isCrewConfirmed
                        ? "Confirmed"
                        : `${occurrence.assignedShifts}/${occurrence.totalShifts} filled`}
                  </td>
                  <td className="px-2 py-2">{formatUsd(occurrence.costSummary.totalUsd)}</td>
                  <td className="px-2 py-2">
                    <Button asChild type="button" variant="outline" size="sm">
                      <Link href={`/dashboard/events/${occurrence._id}`}>Open event</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Series actions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-md border p-3">
            <Label>Add occurrences</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={additionalCount}
                onChange={(event) => setAdditionalCount(event.target.value)}
              />
              <Button type="button" onClick={() => void handleAddOccurrences()}>
                Add
              </Button>
            </div>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <Label>Cancel from occurrence index (0-based)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                value={cancelFromIndex}
                onChange={(event) => setCancelFromIndex(event.target.value)}
              />
              <Button type="button" variant="outline" onClick={() => void handleCancelFuture()}>
                Cancel future
              </Button>
            </div>
          </div>
          <div className="md:col-span-2">
            <Button type="button" variant="destructive" onClick={() => void handleEndSeries()}>
              End series
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

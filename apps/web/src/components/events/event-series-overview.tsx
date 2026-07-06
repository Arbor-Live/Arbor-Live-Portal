"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { useConvexForm } from "@/hooks/use-convex-form";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatEventStatusLabel, normalizeEventStatus } from "@/lib/event-status";
import { formatOccurrencePreview } from "@/lib/event-series";
import { formatUsd } from "@/lib/format";
import {
  eventSeriesCostsSchema,
  type EventSeriesCostsFormValues,
} from "@/lib/validations/event";
import { EventSeriesScheduleEditor } from "@/components/events/event-series-schedule-editor";
import { EventSeriesShiftEditor } from "@/components/events/event-series-shift-editor";
import { authClient } from "@/lib/auth-client";

function intervalLabel(weeks: number) {
  if (weeks === 1) return "Weekly";
  return `Every ${weeks} weeks`;
}

function emptyCostsForm(): EventSeriesCostsFormValues {
  return {
    budgetUsd: "",
    occurrenceBandsCostUsd: "",
    occurrenceExternalRentalsCostUsd: "",
    occurrenceOtherCostUsd: "",
    occurrenceBudgetCrewCostUsd: "",
    budgetCrewHourlyRateUsd: "",
    seriesBandsCostUsd: "",
    seriesExternalRentalsCostUsd: "",
    seriesOtherCostUsd: "",
    propagateOccurrenceCosts: true,
  };
}

type SeriesDoc = NonNullable<NonNullable<ReturnType<typeof useQuery<typeof api.eventSeries.get>>>["series"]>;

function costsFromSeries(series: SeriesDoc): EventSeriesCostsFormValues {
  if (!series) return emptyCostsForm();
  return {
    budgetUsd: series.budgetUsd !== undefined ? String(series.budgetUsd) : "",
    occurrenceBandsCostUsd:
      series.occurrenceBandsCostUsd !== undefined ? String(series.occurrenceBandsCostUsd) : "",
    occurrenceExternalRentalsCostUsd:
      series.occurrenceExternalRentalsCostUsd !== undefined
        ? String(series.occurrenceExternalRentalsCostUsd)
        : "",
    occurrenceOtherCostUsd:
      series.occurrenceOtherCostUsd !== undefined ? String(series.occurrenceOtherCostUsd) : "",
    occurrenceBudgetCrewCostUsd:
      series.occurrenceBudgetCrewCostUsd !== undefined
        ? String(series.occurrenceBudgetCrewCostUsd)
        : "",
    budgetCrewHourlyRateUsd:
      series.budgetCrewHourlyRateUsd !== undefined ? String(series.budgetCrewHourlyRateUsd) : "",
    seriesBandsCostUsd: series.seriesBandsCostUsd !== undefined ? String(series.seriesBandsCostUsd) : "",
    seriesExternalRentalsCostUsd:
      series.seriesExternalRentalsCostUsd !== undefined
        ? String(series.seriesExternalRentalsCostUsd)
        : "",
    seriesOtherCostUsd:
      series.seriesOtherCostUsd !== undefined ? String(series.seriesOtherCostUsd) : "",
    propagateOccurrenceCosts: true,
  };
}

export function EventSeriesOverview({ seriesId }: { seriesId: Id<"eventSeries"> }) {
  const router = useRouter();
  const viewer = useQuery(api.users.getViewer, {});
  const session = authClient.useSession();
  const data = useQuery(api.eventSeries.get, { id: seriesId });
  const invoices = useQuery(api.invoices.list, { status: "draft" });
  const addOccurrences = useMutation(api.eventSeries.addOccurrences);
  const cancelFuture = useMutation(api.eventSeries.cancelFuture);
  const endSeries = useMutation(api.eventSeries.endSeries);
  const updateSeriesCosts = useMutation(api.eventSeries.updateSeriesCosts);
  const linkInvoice = useMutation(api.eventSeries.linkInvoice);
  const unlinkInvoice = useMutation(api.eventSeries.unlinkInvoice);
  const createDraftForSeries = useMutation(api.invoices.createDraftForSeries);
  const scaffoldPullList = useMutation(api.eventSeriesPullLists.scaffoldFromInvoice);

  const [invoiceLinkId, setInvoiceLinkId] = useState("");

  const costsForm = useConvexForm<EventSeriesCostsFormValues>({
    schema: eventSeriesCostsSchema,
    defaultValues: emptyCostsForm(),
    mode: "onChange",
  });

  const [additionalCount, setAdditionalCount] = useState("5");
  const [cancelFromIndex, setCancelFromIndex] = useState("0");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.series) return;
    if (costsForm.formState.isDirty) return;
    costsForm.reset(costsFromSeries(data.series));
    setInvoiceLinkId(data.series.invoiceId ?? "");
  }, [data?.series, costsForm]);

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

  const onSaveCosts = costsForm.submitMutation(async (values) => {
    await updateSeriesCosts({
      id: seriesId,
      budgetUsd: values.budgetUsd.trim() ? Number(values.budgetUsd) : undefined,
      occurrenceBandsCostUsd: values.occurrenceBandsCostUsd.trim()
        ? Number(values.occurrenceBandsCostUsd)
        : undefined,
      occurrenceExternalRentalsCostUsd: values.occurrenceExternalRentalsCostUsd.trim()
        ? Number(values.occurrenceExternalRentalsCostUsd)
        : undefined,
      occurrenceOtherCostUsd: values.occurrenceOtherCostUsd.trim()
        ? Number(values.occurrenceOtherCostUsd)
        : undefined,
      occurrenceBudgetCrewCostUsd: values.occurrenceBudgetCrewCostUsd.trim()
        ? Number(values.occurrenceBudgetCrewCostUsd)
        : undefined,
      budgetCrewHourlyRateUsd: values.budgetCrewHourlyRateUsd.trim()
        ? Number(values.budgetCrewHourlyRateUsd)
        : undefined,
      seriesBandsCostUsd: values.seriesBandsCostUsd.trim() ? Number(values.seriesBandsCostUsd) : undefined,
      seriesExternalRentalsCostUsd: values.seriesExternalRentalsCostUsd.trim()
        ? Number(values.seriesExternalRentalsCostUsd)
        : undefined,
      seriesOtherCostUsd: values.seriesOtherCostUsd.trim() ? Number(values.seriesOtherCostUsd) : undefined,
      propagateOccurrenceCosts: values.propagateOccurrenceCosts,
    });
    setMessage("Series costs saved.");
  });

  if (data === undefined) {
    return <p className="text-sm text-muted-foreground">Loading series...</p>;
  }

  if (!data || !data.series) {
    return <p className="text-sm text-rose-700">Event series not found.</p>;
  }

  const occurrences = data.occurrences;
  const series = data.series;
  const costSummary = data.costSummary;

  async function handleAddOccurrences() {
    try {
      const count = Number(additionalCount);
      if (!Number.isFinite(count) || count < 1) {
        setMessage("Enter a valid occurrence count.");
        return;
      }
      await addOccurrences({ id: seriesId, additionalCount: count });
      setMessage(`Added ${count} occurrence${count === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(getConvexErrorMessage(error, "Failed to add occurrences."));
    }
  }

  async function handleCancelFuture() {
    const fromIndex = Number(cancelFromIndex);
    if (!Number.isFinite(fromIndex) || fromIndex < 0) {
      setMessage("Enter a valid occurrence index.");
      return;
    }
    const shouldCancel = window.confirm(
      `Cancel all occurrences from index ${fromIndex} onward?`,
    );
    if (!shouldCancel) return;
    try {
      const result = await cancelFuture({ id: seriesId, fromOccurrenceIndex: fromIndex });
      setMessage(`Cancelled ${result.cancelledCount} occurrence${result.cancelledCount === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(getConvexErrorMessage(error, "Failed to cancel occurrences."));
    }
  }

  async function handleEndSeries() {
    const shouldEnd = window.confirm("Mark this series as ended?");
    if (!shouldEnd) return;
    try {
      await endSeries({ id: seriesId });
      setMessage("Series marked as ended.");
    } catch (error) {
      setMessage(getConvexErrorMessage(error, "Failed to end series."));
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

      {message ? (
        <p className="rounded-md border px-3 py-2 text-sm">{message}</p>
      ) : null}

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
                      setMessage(`Built pull list template from invoice (${result.templateCount} lines).`),
                    )
                    .catch((error) =>
                      setMessage(getConvexErrorMessage(error, "Failed to scaffold pull list.")),
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
                    .then(() => setMessage("Invoice unlinked from series."))
                    .catch((error) =>
                      setMessage(getConvexErrorMessage(error, "Failed to unlink invoice.")),
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
                disabled={!session.data?.user?.id}
                onClick={() => {
                  const user = session.data?.user;
                  if (!user?.id) return;
                  void createDraftForSeries({
                    seriesId,
                    managerUserId: user.id,
                    managerName: user.name ?? "Manager",
                    managerEmail: user.email ?? undefined,
                  })
                    .then((result) => {
                      router.push(`/dashboard/financial-hub/invoices/${result.id}`);
                    })
                    .catch((error) =>
                      setMessage(getConvexErrorMessage(error, "Failed to create invoice.")),
                    );
                }}
              >
                Create invoice for series
              </Button>
              <div className="min-w-[16rem] flex-1 space-y-2">
                <Label>Link draft invoice</Label>
                <SearchableSelect
                  value={invoiceLinkId}
                  onChange={setInvoiceLinkId}
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
                    .then(() => setMessage("Invoice linked to series and all active occurrences."))
                    .catch((error) =>
                      setMessage(getConvexErrorMessage(error, "Failed to link invoice.")),
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
              <p className="text-xs text-muted-foreground">Per-occurrence (actual)</p>
              <p className="text-lg font-semibold">{formatUsd(costSummary.perOccurrence.totalUsd)}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Series recurring</p>
              <p className="text-lg font-semibold">{formatUsd(costSummary.seriesRecurring.totalUsd)}</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-5 text-sm">
            <p>Crew (actual): {formatUsd(costSummary.perOccurrence.crewUsd)}</p>
            <p>Crew (budgeted): {formatUsd(costSummary.occurrenceTemplate.projectedBudgetCrewUsd)}</p>
            <p>Bands (events): {formatUsd(costSummary.perOccurrence.bandsUsd)}</p>
            <p>External rentals: {formatUsd(costSummary.perOccurrence.externalRentalsUsd)}</p>
            <p>Other: {formatUsd(costSummary.perOccurrence.otherUsd)}</p>
          </div>
          {costSummary.budgetUsd !== undefined ? (
            <p className="text-sm">
              Budget: {formatUsd(costSummary.budgetUsd)}
              {costSummary.projectedBudgetRemainingUsd !== undefined ? (
                <span
                  className={
                    costSummary.projectedBudgetRemainingUsd >= 0 ? " text-emerald-700" : " text-rose-700"
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

      <Card>
        <CardHeader>
          <CardTitle>Recurring &amp; template costs</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...costsForm}>
            <form
              onSubmit={costsForm.handleSubmit(onSaveCosts)}
              className="grid gap-3 md:grid-cols-3"
            >
              <div className="space-y-1 md:col-span-3">
                <TextFormField name="budgetUsd" label="Series budget (USD)" />
              </div>
              <div className="space-y-1">
                <TextFormField name="occurrenceBandsCostUsd" label="Per-occurrence bands (USD)" />
                <p className="text-xs text-muted-foreground">Default bands cost applied to each event.</p>
              </div>
              <div className="space-y-1">
                <TextFormField name="occurrenceBudgetCrewCostUsd" label="Per-occurrence budget crew (USD)" />
                <p className="text-xs text-muted-foreground">
                  Standard crew cost assumed for budgeting until shifts are staffed.
                </p>
              </div>
              <div className="space-y-1">
                <TextFormField name="budgetCrewHourlyRateUsd" label="Default crew hourly rate (USD)" />
                <p className="text-xs text-muted-foreground">
                  Used when estimating empty shift costs from the shift template.
                </p>
              </div>
              <div className="space-y-1">
                <TextFormField
                  name="occurrenceExternalRentalsCostUsd"
                  label="Per-occurrence external rentals (USD)"
                />
              </div>
              <div className="space-y-1">
                <TextFormField name="occurrenceOtherCostUsd" label="Per-occurrence other costs (USD)" />
                <p className="text-xs text-muted-foreground">Default other costs applied to each event.</p>
              </div>
              <div className="space-y-1">
                <TextFormField name="seriesBandsCostUsd" label="Series-wide bands (USD)" />
                <p className="text-xs text-muted-foreground">Counted once for the whole series.</p>
              </div>
              <div className="space-y-1">
                <TextFormField
                  name="seriesExternalRentalsCostUsd"
                  label="Series-wide external rentals (USD)"
                />
              </div>
              <div className="space-y-1">
                <TextFormField name="seriesOtherCostUsd" label="Series-wide other costs (USD)" />
              </div>
              <label className="flex items-center gap-2 text-sm md:col-span-3">
                <input
                  type="checkbox"
                  checked={costsForm.watch("propagateOccurrenceCosts")}
                  onChange={(event) =>
                    costsForm.setValue("propagateOccurrenceCosts", event.target.checked, {
                      shouldDirty: true,
                    })
                  }
                />
                Push per-occurrence template costs to linked events (skips detached/cancelled)
              </label>
              <div className="md:col-span-3">
                <Button type="submit" disabled={costsForm.saveStatus === "saving"}>
                  Save series costs
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <EventSeriesScheduleEditor
        seriesId={seriesId}
        anchorStartAt={series.anchorStartAt}
        anchorEndAt={series.anchorEndAt}
        eventType={series.eventType}
        rentalFulfillmentMode={series.rentalFulfillmentMode}
        blockTemplates={series.blockTemplates}
        occurrences={occurrences}
        onMessage={setMessage}
      />

      <EventSeriesShiftEditor
        seriesId={seriesId}
        anchorStartAt={series.anchorStartAt}
        anchorEndAt={series.anchorEndAt}
        eventType={series.eventType}
        rentalFulfillmentMode={series.rentalFulfillmentMode}
        blockTemplates={series.blockTemplates}
        shiftTemplates={series.shiftTemplates}
        budgetCrewHourlyRateUsd={series.budgetCrewHourlyRateUsd}
        occurrences={occurrences}
        onMessage={setMessage}
      />

      <Card>
        <CardHeader>
          <CardTitle>Occurrences</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
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

      <FormSaveBar
        tier="C"
        saveStatus={costsForm.saveStatus}
        saveError={costsForm.saveError}
        isDirty={costsForm.formState.isDirty}
        saveLabel="Save series costs"
        onSave={() => void costsForm.handleSubmit(onSaveCosts)()}
        onDiscard={() => {
          costsForm.reset(costsFromSeries(series));
        }}
        onRetry={() => void costsForm.handleSubmit(onSaveCosts)()}
      />
    </div>
  );
}

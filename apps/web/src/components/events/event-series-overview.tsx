"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEventStatusLabel, normalizeEventStatus } from "@/lib/event-status";
import { formatOccurrencePreview } from "@/lib/event-series";
import { EventSeriesScheduleEditor } from "@/components/events/event-series-schedule-editor";
import { EventSeriesShiftEditor } from "@/components/events/event-series-shift-editor";

function intervalLabel(weeks: number) {
  if (weeks === 1) return "Weekly";
  return `Every ${weeks} weeks`;
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

export function EventSeriesOverview({ seriesId }: { seriesId: Id<"eventSeries"> }) {
  const data = useQuery(api.eventSeries.get, { id: seriesId });
  const addOccurrences = useMutation(api.eventSeries.addOccurrences);
  const cancelFuture = useMutation(api.eventSeries.cancelFuture);
  const endSeries = useMutation(api.eventSeries.endSeries);
  const updateSeriesCosts = useMutation(api.eventSeries.updateSeriesCosts);

  const [additionalCount, setAdditionalCount] = useState("5");
  const [cancelFromIndex, setCancelFromIndex] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [budgetUsd, setBudgetUsd] = useState("");
  const [occurrenceBandsCostUsd, setOccurrenceBandsCostUsd] = useState("");
  const [occurrenceExternalRentalsCostUsd, setOccurrenceExternalRentalsCostUsd] = useState("");
  const [occurrenceOtherCostUsd, setOccurrenceOtherCostUsd] = useState("");
  const [occurrenceBudgetCrewCostUsd, setOccurrenceBudgetCrewCostUsd] = useState("");
  const [budgetCrewHourlyRateUsd, setBudgetCrewHourlyRateUsd] = useState("");
  const [seriesBandsCostUsd, setSeriesBandsCostUsd] = useState("");
  const [seriesExternalRentalsCostUsd, setSeriesExternalRentalsCostUsd] = useState("");
  const [seriesOtherCostUsd, setSeriesOtherCostUsd] = useState("");
  const [propagateOccurrenceCosts, setPropagateOccurrenceCosts] = useState(true);

  useEffect(() => {
    if (!data?.series) return;
    const series = data.series;
    setBudgetUsd(series.budgetUsd !== undefined ? String(series.budgetUsd) : "");
    setOccurrenceBandsCostUsd(
      series.occurrenceBandsCostUsd !== undefined ? String(series.occurrenceBandsCostUsd) : "",
    );
    setOccurrenceExternalRentalsCostUsd(
      series.occurrenceExternalRentalsCostUsd !== undefined
        ? String(series.occurrenceExternalRentalsCostUsd)
        : "",
    );
    setOccurrenceOtherCostUsd(
      series.occurrenceOtherCostUsd !== undefined ? String(series.occurrenceOtherCostUsd) : "",
    );
    setOccurrenceBudgetCrewCostUsd(
      series.occurrenceBudgetCrewCostUsd !== undefined ? String(series.occurrenceBudgetCrewCostUsd) : "",
    );
    setBudgetCrewHourlyRateUsd(
      series.budgetCrewHourlyRateUsd !== undefined ? String(series.budgetCrewHourlyRateUsd) : "",
    );
    setSeriesBandsCostUsd(series.seriesBandsCostUsd !== undefined ? String(series.seriesBandsCostUsd) : "");
    setSeriesExternalRentalsCostUsd(
      series.seriesExternalRentalsCostUsd !== undefined ? String(series.seriesExternalRentalsCostUsd) : "",
    );
    setSeriesOtherCostUsd(series.seriesOtherCostUsd !== undefined ? String(series.seriesOtherCostUsd) : "");
  }, [data?.series]);

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
    return <p className="text-sm text-rose-700">Event series not found.</p>;
  }

  const occurrences = data.occurrences;
  const series = data.series;
  const costSummary = data.costSummary;

  async function handleSaveCosts() {
    try {
      await updateSeriesCosts({
        id: seriesId,
        budgetUsd: budgetUsd.trim() ? Number(budgetUsd) : undefined,
        occurrenceBandsCostUsd: occurrenceBandsCostUsd.trim()
          ? Number(occurrenceBandsCostUsd)
          : undefined,
        occurrenceExternalRentalsCostUsd: occurrenceExternalRentalsCostUsd.trim()
          ? Number(occurrenceExternalRentalsCostUsd)
          : undefined,
        occurrenceOtherCostUsd: occurrenceOtherCostUsd.trim()
          ? Number(occurrenceOtherCostUsd)
          : undefined,
        occurrenceBudgetCrewCostUsd: occurrenceBudgetCrewCostUsd.trim()
          ? Number(occurrenceBudgetCrewCostUsd)
          : undefined,
        budgetCrewHourlyRateUsd: budgetCrewHourlyRateUsd.trim()
          ? Number(budgetCrewHourlyRateUsd)
          : undefined,
        seriesBandsCostUsd: seriesBandsCostUsd.trim() ? Number(seriesBandsCostUsd) : undefined,
        seriesExternalRentalsCostUsd: seriesExternalRentalsCostUsd.trim()
          ? Number(seriesExternalRentalsCostUsd)
          : undefined,
        seriesOtherCostUsd: seriesOtherCostUsd.trim() ? Number(seriesOtherCostUsd) : undefined,
        propagateOccurrenceCosts,
      });
      setMessage("Series costs saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save series costs.");
    }
  }

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
      setMessage(error instanceof Error ? error.message : "Failed to add occurrences.");
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
      setMessage(error instanceof Error ? error.message : "Failed to cancel occurrences.");
    }
  }

  async function handleEndSeries() {
    const shouldEnd = window.confirm("Mark this series as ended?");
    if (!shouldEnd) return;
    try {
      await endSeries({ id: seriesId });
      setMessage("Series marked as ended.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to end series.");
    }
  }

  return (
    <div className="space-y-4">
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
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1 md:col-span-3">
            <Label>Series budget (USD)</Label>
            <Input value={budgetUsd} onChange={(event) => setBudgetUsd(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Per-occurrence bands (USD)</Label>
            <Input
              value={occurrenceBandsCostUsd}
              onChange={(event) => setOccurrenceBandsCostUsd(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Default bands cost applied to each event.</p>
          </div>
          <div className="space-y-1">
            <Label>Per-occurrence budget crew (USD)</Label>
            <Input
              value={occurrenceBudgetCrewCostUsd}
              onChange={(event) => setOccurrenceBudgetCrewCostUsd(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Standard crew cost assumed for budgeting until shifts are staffed.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Default crew hourly rate (USD)</Label>
            <Input
              value={budgetCrewHourlyRateUsd}
              onChange={(event) => setBudgetCrewHourlyRateUsd(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Used when estimating empty shift costs from the shift template.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Per-occurrence external rentals (USD)</Label>
            <Input
              value={occurrenceExternalRentalsCostUsd}
              onChange={(event) => setOccurrenceExternalRentalsCostUsd(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Per-occurrence other costs (USD)</Label>
            <Input
              value={occurrenceOtherCostUsd}
              onChange={(event) => setOccurrenceOtherCostUsd(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Default other costs applied to each event.</p>
          </div>
          <div className="space-y-1">
            <Label>Series-wide bands (USD)</Label>
            <Input value={seriesBandsCostUsd} onChange={(event) => setSeriesBandsCostUsd(event.target.value)} />
            <p className="text-xs text-muted-foreground">Counted once for the whole series.</p>
          </div>
          <div className="space-y-1">
            <Label>Series-wide external rentals (USD)</Label>
            <Input
              value={seriesExternalRentalsCostUsd}
              onChange={(event) => setSeriesExternalRentalsCostUsd(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Series-wide other costs (USD)</Label>
            <Input value={seriesOtherCostUsd} onChange={(event) => setSeriesOtherCostUsd(event.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm md:col-span-3">
            <input
              type="checkbox"
              checked={propagateOccurrenceCosts}
              onChange={(event) => setPropagateOccurrenceCosts(event.target.checked)}
            />
            Push per-occurrence template costs to linked events (skips detached/cancelled)
          </label>
          <div className="md:col-span-3">
            <Button type="button" onClick={() => void handleSaveCosts()}>
              Save series costs
            </Button>
          </div>
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
    </div>
  );
}

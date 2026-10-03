"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CurrencyDollarIcon, ReceiptIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { useConvexForm } from "@/hooks/use-convex-form";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { formatUsd } from "@/lib/format";
import { groupDayNoun } from "@/lib/event-series";
import { eventSeriesCostsSchema, type EventSeriesCostsFormValues } from "@/lib/validations/event";
import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";
import { useEventGroup } from "@/components/events/group/event-group-context";

type GroupDoc = NonNullable<ReturnType<typeof useEventGroup>["data"]>["series"];

function toField(value: number | undefined) {
  return value !== undefined ? String(value) : "";
}

function costsFromGroup(group: GroupDoc): EventSeriesCostsFormValues {
  return {
    budgetUsd: toField(group.budgetUsd),
    occurrenceBandsCostUsd: toField(group.occurrenceBandsCostUsd),
    occurrenceExternalRentalsCostUsd: toField(group.occurrenceExternalRentalsCostUsd),
    occurrenceOtherCostUsd: toField(group.occurrenceOtherCostUsd),
    occurrenceBudgetCrewCostUsd: toField(group.occurrenceBudgetCrewCostUsd),
    seriesBandsCostUsd: toField(group.seriesBandsCostUsd),
    seriesExternalRentalsCostUsd: toField(group.seriesExternalRentalsCostUsd),
    seriesOtherCostUsd: toField(group.seriesOtherCostUsd),
    propagateOccurrenceCosts: true,
  };
}

const EMPTY_COSTS: EventSeriesCostsFormValues = {
  budgetUsd: "",
  occurrenceBandsCostUsd: "",
  occurrenceExternalRentalsCostUsd: "",
  occurrenceOtherCostUsd: "",
  occurrenceBudgetCrewCostUsd: "",
  seriesBandsCostUsd: "",
  seriesExternalRentalsCostUsd: "",
  seriesOtherCostUsd: "",
  propagateOccurrenceCosts: true,
};

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : undefined;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Billing and budget for an event group (series costs, or a booking's total budget). */
export function EventGroupBudgetTab({
  onDirtyChange,
}: {
  /** Reports unsaved budget edits (the group page marks the tab). */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { groupId, data, kind } = useEventGroup();
  const router = useRouter();
  const shell = useSessionShell();
  const viewer = useSessionViewer();
  const invoices = useQuery(api.invoices.list, kind === "recurring" ? { status: "draft" } : "skip");
  const updateSeriesCosts = useMutation(api.eventSeries.updateSeriesCosts);
  const linkInvoice = useMutation(api.eventSeries.linkInvoice);
  const unlinkInvoice = useMutation(api.eventSeries.unlinkInvoice);
  const createDraftForSeries = useMutation(api.invoices.createDraftForSeries);
  const scaffoldPullList = useMutation(api.eventSeriesPullLists.scaffoldFromInvoice);
  const [invoiceLinkOverride, setInvoiceLinkOverride] = useState<string | null>(null);

  const costsForm = useConvexForm<EventSeriesCostsFormValues>({
    schema: eventSeriesCostsSchema,
    defaultValues: data ? costsFromGroup(data.series) : EMPTY_COSTS,
    mode: "onChange",
  });

  const series = data?.series;
  useEffect(() => {
    if (!series || costsForm.formState.isDirty) return;
    costsForm.reset(costsFromGroup(series));
  }, [series, costsForm]);

  const costsDirty = costsForm.formState.isDirty;
  useEffect(() => {
    onDirtyChange?.(costsDirty);
  }, [costsDirty, onDirtyChange]);

  const invoiceOptions = useMemo(
    () =>
      (invoices ?? []).map((row) => ({
        value: row._id,
        label: `${row.invoiceNumber} · ${formatUsd(row.totalUsd)}`,
      })),
    [invoices],
  );

  if (!data || !series) return null;
  const { costSummary } = data;
  const multiDay = kind === "multi_day";
  const noun = groupDayNoun(kind);
  const invoiceLinkId = invoiceLinkOverride ?? series.invoiceId ?? "";
  const linkedInvoiceNumber = data.invoiceNumber ?? "Linked invoice";

  const onSaveCosts = costsForm.submitMutation(async (values) => {
    await updateSeriesCosts({
      id: groupId,
      budgetUsd: optionalNumber(values.budgetUsd),
      occurrenceBandsCostUsd: optionalNumber(values.occurrenceBandsCostUsd),
      occurrenceExternalRentalsCostUsd: optionalNumber(values.occurrenceExternalRentalsCostUsd),
      occurrenceOtherCostUsd: optionalNumber(values.occurrenceOtherCostUsd),
      occurrenceBudgetCrewCostUsd: optionalNumber(values.occurrenceBudgetCrewCostUsd),
      seriesBandsCostUsd: optionalNumber(values.seriesBandsCostUsd),
      seriesExternalRentalsCostUsd: optionalNumber(values.seriesExternalRentalsCostUsd),
      seriesOtherCostUsd: optionalNumber(values.seriesOtherCostUsd),
      propagateOccurrenceCosts: multiDay ? false : values.propagateOccurrenceCosts,
    });
    // The saved values are the new baseline (clears the save bar).
    costsForm.reset(values);
    notify.success("Budget saved.");
  });

  async function attempt(action: () => Promise<unknown>, success: string, failure: string) {
    try {
      await action();
      notify.success(success);
      return true;
    } catch (error) {
      notify.error(getConvexErrorMessage(error, failure));
      return false;
    }
  }

  return (
    <div className="space-y-4" data-testid="event-group-budget">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptIcon className="size-4 text-muted-foreground" aria-hidden />
            Billing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {series.invoiceId ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm">
                Linked invoice: <span className="font-medium">{linkedInvoiceNumber}</span>
              </p>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href={`/dashboard/financial-hub/invoices/${series.invoiceId}`}>Open invoice</Link>
              </Button>
              {!multiDay ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void scaffoldPullList({ seriesId: groupId })
                        .then((result) =>
                          notify.success(
                            `Built the pull list template from the invoice (${result.templateCount} lines).`,
                          ),
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
                      void attempt(
                        () => unlinkInvoice({ id: groupId }),
                        "Invoice unlinked from series.",
                        "Failed to unlink invoice.",
                      ).then((ok) => ok && setInvoiceLinkOverride(null))
                    }
                  >
                    Unlink
                  </Button>
                </>
              ) : null}
            </div>
          ) : multiDay ? (
            <p className="text-sm text-muted-foreground">No invoice is linked to these days.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                disabled={!viewer?.userId}
                onClick={() => {
                  const userId = viewer?.userId;
                  if (!userId) return;
                  void createDraftForSeries({
                    seriesId: groupId,
                    managerUserId: userId,
                    managerName: shell?.account?.name ?? "Manager",
                    managerEmail: shell?.account?.email ?? undefined,
                  })
                    .then((result) => router.push(`/dashboard/financial-hub/invoices/${result.id}`))
                    .catch((error) =>
                      notify.error(getConvexErrorMessage(error, "Failed to create invoice.")),
                    );
                }}
              >
                Create invoice for series
              </Button>
              <div
                className="min-w-64 flex-1 space-y-2"
                role="group"
                aria-labelledby="group-link-invoice-label"
              >
                <Label id="group-link-invoice-label">Link draft invoice</Label>
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
                  void attempt(
                    () => linkInvoice({ id: groupId, invoiceId: invoiceLinkId as Id<"invoices"> }),
                    "Invoice linked to series and all active occurrences.",
                    "Failed to link invoice.",
                  ).then((ok) => ok && setInvoiceLinkOverride(null))
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
          <CardTitle className="flex items-center gap-2">
            <CurrencyDollarIcon className="size-4 text-muted-foreground" aria-hidden />
            Cost summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Grand total (actual)" value={formatUsd(costSummary.grandTotalUsd)} />
            <Stat label="Projected total" value={formatUsd(costSummary.projectedGrandTotalUsd)} />
            <Stat
              label={`Avg per ${noun}${costSummary.activeOccurrenceCount > 0 ? ` (${costSummary.activeOccurrenceCount} active)` : ""}`}
              value={formatUsd(costSummary.averageCostPerOccurrenceUsd)}
            />
            <Stat
              label={multiDay ? "Booking-wide" : "Series recurring"}
              value={formatUsd(costSummary.seriesRecurring.totalUsd)}
            />
          </div>
          <div className="grid gap-2 text-sm tabular-nums md:grid-cols-5">
            <p>Crew (actual): {formatUsd(costSummary.perOccurrence.crewUsd)}</p>
            <p>Crew (budgeted): {formatUsd(costSummary.occurrenceTemplate.projectedBudgetCrewUsd)}</p>
            <p>Artists: {formatUsd(costSummary.perOccurrence.bandsUsd)}</p>
            <p>External rentals: {formatUsd(costSummary.perOccurrence.externalRentalsUsd)}</p>
            <p>Other: {formatUsd(costSummary.perOccurrence.otherUsd)}</p>
          </div>
          {costSummary.budgetUsd !== undefined ? (
            <p className="text-sm tabular-nums">
              Budget: {formatUsd(costSummary.budgetUsd)}
              {costSummary.projectedBudgetRemainingUsd !== undefined ? (
                <span
                  className={
                    costSummary.projectedBudgetRemainingUsd >= 0
                      ? " text-status-emerald-700"
                      : " text-status-rose-700"
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
          <CardTitle className="flex items-center gap-2">
            <CurrencyDollarIcon className="size-4 text-muted-foreground" aria-hidden />
            Budget and template costs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...costsForm}>
            <form
              onSubmit={costsForm.handleSubmit(onSaveCosts)}
              className="grid gap-3 md:grid-cols-3"
            >
              <div className="space-y-1 md:col-span-3">
                <TextFormField
                  name="budgetUsd"
                  label={multiDay ? "Booking budget (USD)" : "Series budget (USD)"}
                />
              </div>
              {!multiDay ? (
                <>
                  <div className="space-y-1">
                    <TextFormField name="occurrenceBandsCostUsd" label="Per-occurrence artists (USD)" />
                    <p className="text-xs text-muted-foreground">Default artists cost applied to each event.</p>
                  </div>
                  <div className="space-y-1">
                    <TextFormField
                      name="occurrenceBudgetCrewCostUsd"
                      label="Per-occurrence budget crew (USD)"
                    />
                    <p className="text-xs text-muted-foreground">
                      Standard crew cost assumed for budgeting until shifts are staffed.
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
                </>
              ) : null}
              <div className="space-y-1">
                <TextFormField
                  name="seriesBandsCostUsd"
                  label={multiDay ? "Booking-wide artists (USD)" : "Series-wide artists (USD)"}
                />
                {!multiDay ? (
                  <p className="text-xs text-muted-foreground">Counted once for the whole series.</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <TextFormField
                  name="seriesExternalRentalsCostUsd"
                  label={multiDay ? "Booking-wide external rentals (USD)" : "Series-wide external rentals (USD)"}
                />
              </div>
              <div className="space-y-1">
                <TextFormField
                  name="seriesOtherCostUsd"
                  label={multiDay ? "Booking-wide other costs (USD)" : "Series-wide other costs (USD)"}
                />
              </div>
              {!multiDay ? (
                <div className="flex items-center gap-2 text-sm md:col-span-3">
                  <Switch
                    id="group-propagate-costs"
                    checked={costsForm.watch("propagateOccurrenceCosts")}
                    onCheckedChange={(checked) =>
                      costsForm.setValue("propagateOccurrenceCosts", checked, { shouldDirty: true })
                    }
                  />
                  <Label htmlFor="group-propagate-costs">
                    Push per-occurrence template costs to linked events (skips detached and cancelled)
                  </Label>
                </div>
              ) : null}
            </form>
          </Form>
        </CardContent>
      </Card>

      <FormSaveBar
        tier="C"
        saveStatus={costsForm.saveStatus}
        saveError={costsForm.saveError}
        isDirty={costsForm.formState.isDirty}
        saveLabel="Save budget"
        onSave={() => void costsForm.handleSubmit(onSaveCosts)()}
        onDiscard={() => costsForm.reset(costsFromGroup(series))}
        onRetry={() => void costsForm.handleSubmit(onSaveCosts)()}
      />
    </div>
  );
}

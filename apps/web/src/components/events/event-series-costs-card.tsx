"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConvexForm } from "@/hooks/use-convex-form";
import { notify } from "@/lib/notify";
import {
  eventSeriesCostsSchema,
  type EventSeriesCostsFormValues,
} from "@/lib/validations/event";

type SeriesDoc = NonNullable<NonNullable<ReturnType<typeof useQuery<typeof api.eventGroups.get>>>["group"]>;

function emptyCostsForm(): EventSeriesCostsFormValues {
  return {
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
}

function costsFromSeries(series: SeriesDoc): EventSeriesCostsFormValues {
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

/** The group's budget / recurring template costs, with its own save bar. */
export function EventSeriesCostsCard({
  seriesId,
  series,
}: {
  seriesId: Id<"eventSeries">;
  series: SeriesDoc;
}) {
  const updateSeriesCosts = useMutation(api.eventSeries.updateSeriesCosts);

  const costsForm = useConvexForm<EventSeriesCostsFormValues>({
    schema: eventSeriesCostsSchema,
    defaultValues: emptyCostsForm(),
    mode: "onChange",
  });

  useEffect(() => {
    if (costsForm.formState.isDirty) return;
    costsForm.reset(costsFromSeries(series));
  }, [series, costsForm]);

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
      seriesBandsCostUsd: values.seriesBandsCostUsd.trim()
        ? Number(values.seriesBandsCostUsd)
        : undefined,
      seriesExternalRentalsCostUsd: values.seriesExternalRentalsCostUsd.trim()
        ? Number(values.seriesExternalRentalsCostUsd)
        : undefined,
      seriesOtherCostUsd: values.seriesOtherCostUsd.trim()
        ? Number(values.seriesOtherCostUsd)
        : undefined,
      propagateOccurrenceCosts: values.propagateOccurrenceCosts,
    });
    notify.success("Group costs saved.");
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Budget &amp; recurring costs</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...costsForm}>
            <form
              onSubmit={costsForm.handleSubmit(onSaveCosts)}
              className="grid gap-3 md:grid-cols-3"
            >
              <div className="space-y-1 md:col-span-3">
                <TextFormField name="budgetUsd" label="Budget (USD)" />
              </div>
              <div className="space-y-1">
                <TextFormField name="occurrenceBandsCostUsd" label="Per-day artists (USD)" />
                <p className="text-xs text-muted-foreground">Default artists cost applied to each event.</p>
              </div>
              <div className="space-y-1">
                <TextFormField name="occurrenceBudgetCrewCostUsd" label="Per-day budget crew (USD)" />
                <p className="text-xs text-muted-foreground">
                  Standard crew cost assumed for budgeting until shifts are staffed.
                </p>
              </div>
              <div className="space-y-1">
                <TextFormField
                  name="occurrenceExternalRentalsCostUsd"
                  label="Per-day external rentals (USD)"
                />
              </div>
              <div className="space-y-1">
                <TextFormField name="occurrenceOtherCostUsd" label="Per-day other costs (USD)" />
                <p className="text-xs text-muted-foreground">Default other costs applied to each event.</p>
              </div>
              <div className="space-y-1">
                <TextFormField name="seriesBandsCostUsd" label="Group-wide artists (USD)" />
                <p className="text-xs text-muted-foreground">Counted once for the whole group.</p>
              </div>
              <div className="space-y-1">
                <TextFormField
                  name="seriesExternalRentalsCostUsd"
                  label="Group-wide external rentals (USD)"
                />
              </div>
              <div className="space-y-1">
                <TextFormField name="seriesOtherCostUsd" label="Group-wide other costs (USD)" />
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
                Push per-day template costs to linked events (skips detached/cancelled)
              </label>
              <div className="md:col-span-3">
                <Button type="submit" disabled={costsForm.saveStatus === "saving"}>
                  Save costs
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <FormSaveBar
        tier="C"
        saveStatus={costsForm.saveStatus}
        saveError={costsForm.saveError}
        isDirty={costsForm.formState.isDirty}
        saveLabel="Save costs"
        onSave={() => void costsForm.handleSubmit(onSaveCosts)()}
        onDiscard={() => costsForm.reset(costsFromSeries(series))}
        onRetry={() => void costsForm.handleSubmit(onSaveCosts)()}
      />
    </>
  );
}

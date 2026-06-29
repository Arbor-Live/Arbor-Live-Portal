import { z } from "zod";

export const seriesEditScopeSchema = z.enum(["this", "future", "all"]);

export const eventSeriesCostsSchema = z.object({
  budgetUsd: z.string(),
  occurrenceBandsCostUsd: z.string(),
  occurrenceExternalRentalsCostUsd: z.string(),
  occurrenceOtherCostUsd: z.string(),
  occurrenceBudgetCrewCostUsd: z.string(),
  budgetCrewHourlyRateUsd: z.string(),
  seriesBandsCostUsd: z.string(),
  seriesExternalRentalsCostUsd: z.string(),
  seriesOtherCostUsd: z.string(),
  propagateOccurrenceCosts: z.boolean(),
});

export type EventSeriesCostsFormValues = z.infer<typeof eventSeriesCostsSchema>;

export const seriesScheduleEditorSchema = z.object({
  applyScope: seriesEditScopeSchema,
  fromOccurrenceIndex: z.string(),
  importOccurrenceId: z.string(),
});

export type SeriesScheduleEditorFormValues = z.infer<typeof seriesScheduleEditorSchema>;

export const seriesShiftEditorSchema = z.object({
  applyScope: seriesEditScopeSchema,
  fromOccurrenceIndex: z.string(),
  importOccurrenceId: z.string(),
  defaultHourlyRate: z.string(),
});

export type SeriesShiftEditorFormValues = z.infer<typeof seriesShiftEditorSchema>;

export const pullListItemFormSchema = z.object({
  clientKey: z.string(),
  quantityRequired: z.coerce.number().min(1, "Quantity must be at least 1"),
  notes: z.string(),
});

export const pullListFormSchema = z.object({
  items: z.array(pullListItemFormSchema),
});

export type PullListFormValues = z.infer<typeof pullListFormSchema>;

import { formatUsd as formatUsdValue } from "@arbor/format";
import type { Doc } from "../_generated/dataModel";

export type SeriesCostSummary = {
  occurrenceCount: number;
  activeOccurrenceCount: number;
  perOccurrence: {
    crewUsd: number;
    bandsUsd: number;
    externalRentalsUsd: number;
    otherUsd: number;
    totalUsd: number;
  };
  occurrenceTemplate: {
    budgetCrewUsd: number;
    bandsUsd: number;
    externalRentalsUsd: number;
    otherUsd: number;
    projectedBudgetCrewUsd: number;
    projectedBandsUsd: number;
    projectedExternalRentalsUsd: number;
    projectedOtherUsd: number;
    projectedPerOccurrenceUsd: number;
  };
  seriesRecurring: {
    bandsUsd: number;
    externalRentalsUsd: number;
    otherUsd: number;
    totalUsd: number;
  };
  grandTotalUsd: number;
  projectedGrandTotalUsd: number;
  /** Bands + external rentals in the projected grand total (pass-through costs). */
  projectedPassThroughUsd: number;
  budgetUsd?: number;
  budgetRemainingUsd?: number;
  projectedBudgetRemainingUsd?: number;
  averageCostPerOccurrenceUsd: number;
  projectedAverageCostPerOccurrenceUsd: number;
};

function sumOptional(values: Array<number | undefined>) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function effectiveCrewUsd(event: Doc<"events">, series: Doc<"eventSeries">) {
  const actual = event.crewCostUsd ?? 0;
  if (actual > 0) return actual;
  return series.occurrenceBudgetCrewCostUsd ?? 0;
}

/** Prefer recorded occurrence cost; fall back to series per-occurrence template. */
function effectiveTemplateCostUsd(
  actual: number | undefined,
  template: number | undefined,
) {
  const recorded = actual ?? 0;
  if (recorded > 0) return recorded;
  return template ?? 0;
}

export function effectiveBandsUsd(event: Doc<"events">, series: Doc<"eventSeries">) {
  return effectiveTemplateCostUsd(event.bandsCostUsd, series.occurrenceBandsCostUsd);
}

export function effectiveExternalRentalsUsd(event: Doc<"events">, series: Doc<"eventSeries">) {
  return effectiveTemplateCostUsd(
    event.externalRentalsCostUsd,
    series.occurrenceExternalRentalsCostUsd,
  );
}

export function effectiveOtherUsd(event: Doc<"events">, series: Doc<"eventSeries">) {
  return effectiveTemplateCostUsd(event.otherCostUsd, series.occurrenceOtherCostUsd);
}

export function computeSeriesCostSummary(
  series: Doc<"eventSeries">,
  occurrences: Doc<"events">[],
): SeriesCostSummary {
  const activeOccurrences = occurrences.filter((row) => row.status !== "cancelled");
  const activeCount = activeOccurrences.length;

  const perOccurrenceCrew = sumOptional(activeOccurrences.map((row) => row.crewCostUsd));
  const perOccurrenceBands = sumOptional(activeOccurrences.map((row) => row.bandsCostUsd));
  const perOccurrenceExternal = sumOptional(activeOccurrences.map((row) => row.externalRentalsCostUsd));
  const perOccurrenceOther = sumOptional(activeOccurrences.map((row) => row.otherCostUsd));
  const perOccurrenceTotal =
    perOccurrenceCrew + perOccurrenceBands + perOccurrenceExternal + perOccurrenceOther;

  const templateBudgetCrew = series.occurrenceBudgetCrewCostUsd ?? 0;
  const templateBands = series.occurrenceBandsCostUsd ?? 0;
  const templateExternal = series.occurrenceExternalRentalsCostUsd ?? 0;
  const templateOther = series.occurrenceOtherCostUsd ?? 0;
  const templatePerOccurrence = templateBudgetCrew + templateBands + templateExternal + templateOther;

  const projectedCrew = sumOptional(activeOccurrences.map((row) => effectiveCrewUsd(row, series)));
  const projectedBands = sumOptional(activeOccurrences.map((row) => effectiveBandsUsd(row, series)));
  const projectedExternal = sumOptional(
    activeOccurrences.map((row) => effectiveExternalRentalsUsd(row, series)),
  );
  const projectedOther = sumOptional(activeOccurrences.map((row) => effectiveOtherUsd(row, series)));
  const projectedPerOccurrenceTotal =
    projectedCrew + projectedBands + projectedExternal + projectedOther;

  const seriesRecurringBands = series.seriesBandsCostUsd ?? 0;
  const seriesRecurringExternal = series.seriesExternalRentalsCostUsd ?? 0;
  const seriesRecurringOther = series.seriesOtherCostUsd ?? 0;
  const seriesRecurringTotal =
    seriesRecurringBands + seriesRecurringExternal + seriesRecurringOther;

  const grandTotalUsd = perOccurrenceTotal + seriesRecurringTotal;
  const projectedGrandTotalUsd = projectedPerOccurrenceTotal + seriesRecurringTotal;
  const projectedPassThroughUsd =
    projectedBands + projectedExternal + seriesRecurringBands + seriesRecurringExternal;
  const budgetUsd = series.budgetUsd;
  const budgetRemainingUsd =
    budgetUsd !== undefined ? budgetUsd - grandTotalUsd : undefined;
  const projectedBudgetRemainingUsd =
    budgetUsd !== undefined ? budgetUsd - projectedGrandTotalUsd : undefined;

  return {
    occurrenceCount: occurrences.length,
    activeOccurrenceCount: activeCount,
    perOccurrence: {
      crewUsd: perOccurrenceCrew,
      bandsUsd: perOccurrenceBands,
      externalRentalsUsd: perOccurrenceExternal,
      otherUsd: perOccurrenceOther,
      totalUsd: perOccurrenceTotal,
    },
    occurrenceTemplate: {
      budgetCrewUsd: templateBudgetCrew,
      bandsUsd: templateBands,
      externalRentalsUsd: templateExternal,
      otherUsd: templateOther,
      projectedBudgetCrewUsd: projectedCrew,
      projectedBandsUsd: templateBands * activeCount,
      projectedExternalRentalsUsd: templateExternal * activeCount,
      projectedOtherUsd: templateOther * activeCount,
      projectedPerOccurrenceUsd: templatePerOccurrence * activeCount,
    },
    seriesRecurring: {
      bandsUsd: seriesRecurringBands,
      externalRentalsUsd: seriesRecurringExternal,
      otherUsd: seriesRecurringOther,
      totalUsd: seriesRecurringTotal,
    },
    grandTotalUsd,
    projectedGrandTotalUsd,
    projectedPassThroughUsd,
    budgetUsd,
    budgetRemainingUsd,
    projectedBudgetRemainingUsd,
    averageCostPerOccurrenceUsd:
      activeCount > 0 ? perOccurrenceTotal / activeCount : perOccurrenceTotal,
    projectedAverageCostPerOccurrenceUsd:
      activeCount > 0 ? projectedPerOccurrenceTotal / activeCount : projectedPerOccurrenceTotal,
  };
}

export function formatUsd(value: number) {
  return formatUsdValue(value);
}

"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  insightsRangeFromDateInputs,
  insightsRangeFromSearchParams,
  insightsSelectionDateInputs,
} from "@/lib/insights-range";

/** The selected range from the URL, as the selection and as `{ startMs, endMs }` (null if invalid). */
export function useInsightsRange() {
  const searchParams = useSearchParams();
  const key = searchParams.toString();
  return useMemo(() => {
    const selection = insightsRangeFromSearchParams(new URLSearchParams(key));
    const { startDate, endDate } = insightsSelectionDateInputs(selection);
    return { selection, range: insightsRangeFromDateInputs(startDate, endDate) };
  }, [key]);
}

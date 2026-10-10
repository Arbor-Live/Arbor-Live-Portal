"use client";

import { useMemo } from "react";
import { usePacificToday } from "@/hooks/use-pacific-today";
import { crewHoursWindows } from "@/lib/crew-hours-windows";

/** This week and this quarter, moving on when the Pacific day changes. */
export function useCrewHoursWindows() {
  const todayKey = usePacificToday();
  return useMemo(() => crewHoursWindows(todayKey), [todayKey]);
}

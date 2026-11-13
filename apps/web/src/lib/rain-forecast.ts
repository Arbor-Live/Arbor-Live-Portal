"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import type { RainHour } from "@arbor/format";
import { api } from "@/lib/convex-api";

/** The stored forecast hours (undefined until loaded or before the first fetch) and the moment risk is judged against. */
export function useRainForecast(): { hours: RainHour[] | undefined; now: number } {
  const hours = useQuery(api.weather.forecastHours);
  const [now] = useState(() => Date.now());
  return { hours: hours ?? undefined, now };
}

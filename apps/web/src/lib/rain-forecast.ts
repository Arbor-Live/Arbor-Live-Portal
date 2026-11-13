"use client";

import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import type { RainHour } from "@arbor/format";
import { api } from "@/lib/convex-api";

/** Finished events and blocks lose their warning within this long while the page stays open. */
const NOW_REFRESH_MS = 5 * 60_000;

/** The stored forecast hours (undefined until loaded or before the first fetch) and the moment risk is judged against. */
export function useRainForecast(): { hours: RainHour[] | undefined; now: number } {
  const hours = useQuery(api.weather.forecastHours);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    const timer = window.setInterval(tick, NOW_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return { hours: hours ?? undefined, now };
}

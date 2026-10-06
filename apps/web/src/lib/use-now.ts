"use client";

import { useEffect, useState } from "react";

function floorTo(ms: number, stepMs: number) {
  return Math.floor(ms / stepMs) * stepMs;
}

/**
 * The current time, floored to `stepMs` and refreshed every `stepMs`, so
 * time-derived UI (a training that just ended) catches up while a page stays
 * open. Flooring keeps Convex query args stable within a step, so subscribers
 * share one cached result instead of re-running every tick.
 */
export function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => floorTo(Date.now(), stepMs));
  useEffect(() => {
    const id = setInterval(() => setNow(floorTo(Date.now(), stepMs)), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}

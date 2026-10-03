"use client";

import { useEffect, useState } from "react";
import { pacificDateKey } from "@/lib/format";

const CHECK_EVERY_MS = 60_000;

/**
 * Today's Pacific day key (`YYYY-MM-DD`), kept current while the page stays
 * open, so "this quarter" moves on when the day (or quarter) does.
 */
export function usePacificToday() {
  const [todayKey, setTodayKey] = useState(() => pacificDateKey(Date.now()));
  useEffect(() => {
    // React skips the re-render when the key hasn't changed.
    const timer = window.setInterval(() => setTodayKey(pacificDateKey(Date.now())), CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, []);
  return todayKey;
}

"use client";

import { useEffect, useState } from "react";

/**
 * Tracks `value`, but only after it stops changing for `delayMs` — so a search
 * box can stay instant while the query behind it settles.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A side panel's open row as a URL param (`?invoice=<id>`), so other pages can
 * link straight to it and closing the panel drops the param. Uses
 * `history.replaceState`, so opening a row doesn't add a history entry.
 */
export function useSheetParam(name: string) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(name);
  const setValue = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (next) params.set(name, next);
      else params.delete(name);
      const query = params.toString();
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [name, pathname],
  );
  return [value, setValue] as const;
}

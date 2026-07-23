"use client";

import { useEffect } from "react";

/** Scrolls to `#payee` when present. Kept as a tiny client island so the page can stay a Server Component. */
export function BandPaymentsHashScroller() {
  useEffect(() => {
    if (window.location.hash !== "#payee") return;
    document.getElementById("payee")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  return null;
}

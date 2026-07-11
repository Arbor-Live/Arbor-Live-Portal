"use client";

import { createContext, useContext } from "react";

export const MarketingEditorChangeContext = createContext<
  ((contentJson: string) => void) | null
>(null);

export function useMarketingEditorChange() {
  return useContext(MarketingEditorChangeContext);
}

"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type ViewMode = "default" | "crew";

type ViewModeContextValue = {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
};

const ViewModeContext = createContext<ViewModeContextValue | undefined>(undefined);

const storageKey = "dashboard-view-mode";

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "default";
    return window.localStorage.getItem(storageKey) === "crew" ? "crew" : "default";
  });

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    window.localStorage.setItem(storageKey, mode);
  };

  const value = useMemo(() => ({ viewMode, setViewMode }), [viewMode]);

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (!context) {
    throw new Error("useViewMode must be used within ViewModeProvider");
  }
  return context;
}

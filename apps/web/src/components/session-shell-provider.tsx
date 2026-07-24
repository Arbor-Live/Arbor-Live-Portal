"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";

type SessionShell = ReturnType<typeof useQuery<typeof api.users.getSessionShell>>;

const SessionShellContext = createContext<{ shell: SessionShell }>({ shell: undefined });

export function SessionShellProvider({ children }: { children: ReactNode }) {
  const shell = useQuery(api.users.getSessionShell, {});
  return (
    <SessionShellContext.Provider value={{ shell }}>{children}</SessionShellContext.Provider>
  );
}

/** Dashboard session payload (viewer, account, orgs, onboarding). undefined while loading. */
export function useSessionShell() {
  return useContext(SessionShellContext).shell;
}

export function useSessionViewer() {
  return useSessionShell()?.viewer ?? null;
}

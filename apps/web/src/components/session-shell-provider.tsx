"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery, type Preloaded } from "convex/react";
import { usePreloadedAuthQuery } from "@convex-dev/better-auth/nextjs/client";
import { api } from "@/lib/convex-api";

type SessionShell = ReturnType<typeof useQuery<typeof api.users.getSessionShell>>;

const SessionShellContext = createContext<{ shell: SessionShell }>({ shell: undefined });

function SessionShellFromQuery({ children }: { children: ReactNode }) {
  const shell = useQuery(api.users.getSessionShell, {});
  return (
    <SessionShellContext.Provider value={{ shell }}>{children}</SessionShellContext.Provider>
  );
}

function SessionShellFromPreload({
  children,
  preloadedShell,
}: {
  children: ReactNode;
  preloadedShell: Preloaded<typeof api.users.getSessionShell>;
}) {
  const shell = usePreloadedAuthQuery(preloadedShell);
  return (
    <SessionShellContext.Provider value={{ shell }}>{children}</SessionShellContext.Provider>
  );
}

export function SessionShellProvider({
  children,
  preloadedShell,
}: {
  children: ReactNode;
  preloadedShell?: Preloaded<typeof api.users.getSessionShell>;
}) {
  if (preloadedShell) {
    return (
      <SessionShellFromPreload preloadedShell={preloadedShell}>{children}</SessionShellFromPreload>
    );
  }
  return <SessionShellFromQuery>{children}</SessionShellFromQuery>;
}

/** Dashboard session payload (viewer, account, orgs, onboarding). undefined while loading. */
export function useSessionShell() {
  return useContext(SessionShellContext).shell;
}

export function useSessionViewer() {
  return useSessionShell()?.viewer ?? null;
}

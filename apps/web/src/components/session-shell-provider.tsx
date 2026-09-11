"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { useQuery, type Preloaded } from "convex/react";
import { usePreloadedAuthQuery } from "@convex-dev/better-auth/nextjs/client";
import { api } from "@/lib/convex-api";

type SessionShell = ReturnType<typeof useQuery<typeof api.users.getSessionShell>>;

const SessionShellContext = createContext<{ shell: SessionShell }>({ shell: undefined });

function syncSentryFromShell(shell: SessionShell) {
  // undefined = still loading; leave whatever auth already set.
  if (shell === undefined) return;

  if (shell === null) {
    Sentry.setContext("arbor", null);
    Sentry.setTag("arbor_role", "");
    Sentry.setTag("arbor_is_admin", "");
    Sentry.setTag("arbor_org", "");
    return;
  }

  Sentry.setUser({
    id: shell.viewer.userId,
    email: shell.account.email,
    username: shell.account.name,
  });

  const role = shell.viewer.role ?? (shell.viewer.isAdmin ? "admin" : "member");
  Sentry.setTag("arbor_role", role);
  Sentry.setTag("arbor_is_admin", shell.viewer.isAdmin ? "true" : "false");
  Sentry.setTag(
    "arbor_org",
    shell.activeOrganization?.slug ?? shell.activeOrganization?.organizationId ?? "",
  );

  Sentry.setContext("arbor", {
    role,
    isAdmin: shell.viewer.isAdmin,
    isCrewOnly: shell.viewer.isCrewOnly,
    verticals: shell.viewer.verticals,
    disciplines: shell.viewer.disciplines,
    activeOrganization: shell.activeOrganization
      ? {
          id: shell.activeOrganization.organizationId,
          name: shell.activeOrganization.name,
          slug: shell.activeOrganization.slug,
          role: shell.activeOrganization.role,
          organizationType: shell.activeOrganization.organizationType,
        }
      : null,
  });
}

function useSentrySessionShellSync(shell: SessionShell) {
  useEffect(() => {
    syncSentryFromShell(shell);
  }, [shell]);
}

function SessionShellFromQuery({ children }: { children: ReactNode }) {
  const shell = useQuery(api.users.getSessionShell, {});
  useSentrySessionShellSync(shell);
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
  useSentrySessionShellSync(shell);
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

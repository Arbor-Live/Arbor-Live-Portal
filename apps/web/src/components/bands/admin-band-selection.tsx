"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { isArtistOrganizationType } from "@/lib/artist-types";
import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";

const STORAGE_KEY = "arbor.adminBandOrganizationId";

const adminBandOrgStorageListeners = new Set<() => void>();

function subscribeAdminBandOrgStorage(onStoreChange: () => void) {
  adminBandOrgStorageListeners.add(onStoreChange);
  return () => adminBandOrgStorageListeners.delete(onStoreChange);
}

function getAdminBandOrgStorageSnapshot() {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getAdminBandOrgStorageServerSnapshot() {
  return null;
}

function setAdminBandOrgStorage(next: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore
  }
  for (const listener of adminBandOrgStorageListeners) {
    listener();
  }
}

type AdminBandSelectionContextValue = {
  /** When set, rider/profile APIs should target this band (admin mode). */
  organizationId: string | null;
  setOrganizationId: (organizationId: string) => void;
  isAdminManaging: boolean;
};

const AdminBandSelectionContext = createContext<AdminBandSelectionContextValue>({
  organizationId: null,
  setOrganizationId: () => undefined,
  isAdminManaging: false,
});

export function useAdminBandSelection() {
  return useContext(AdminBandSelectionContext);
}

export function AdminBandSelectionProvider({ children }: { children: ReactNode }) {
  const shell = useSessionShell();
  const viewer = useSessionViewer();
  const activeOrg = shell?.activeOrganization;
  const isBandContext = isArtistOrganizationType(activeOrg?.organizationType);
  const isAdminManaging = Boolean(viewer?.isAdmin && !isBandContext);
  const bands = useQuery(
    api.users.listBandOrganizationsAdmin,
    isAdminManaging ? { includeArchived: false } : "skip",
  );

  const organizationIdState = useSyncExternalStore(
    subscribeAdminBandOrgStorage,
    getAdminBandOrgStorageSnapshot,
    getAdminBandOrgStorageServerSnapshot,
  );

  const organizationId = useMemo(() => {
    if (!isAdminManaging) return null;
    if (bands === undefined) return organizationIdState;
    if (bands.length === 0) return null;
    if (
      organizationIdState &&
      bands.some((band) => band.organizationId === organizationIdState)
    ) {
      return organizationIdState;
    }
    return bands[0]?.organizationId ?? organizationIdState;
  }, [bands, isAdminManaging, organizationIdState]);

  const setOrganizationId = useCallback((next: string) => {
    setAdminBandOrgStorage(next);
  }, []);

  return (
    <AdminBandSelectionContext.Provider
      value={{
        organizationId,
        setOrganizationId,
        isAdminManaging,
      }}
    >
      {children}
    </AdminBandSelectionContext.Provider>
  );
}

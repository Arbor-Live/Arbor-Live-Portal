"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STORAGE_KEY = "arbor.adminBandOrganizationId";

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
  const isBandContext =
    activeOrg?.organizationType === "band" || activeOrg?.organizationType === "dj";
  const isAdminManaging = Boolean(viewer?.isAdmin && !isBandContext);

  const [organizationId, setOrganizationIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdminManaging) {
      setOrganizationIdState(null);
      return;
    }
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setOrganizationIdState(stored);
    } catch {
      // ignore
    }
  }, [isAdminManaging]);

  const setOrganizationId = useCallback((next: string) => {
    setOrganizationIdState(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  return (
    <AdminBandSelectionContext.Provider
      value={{
        organizationId: isAdminManaging ? organizationId : null,
        setOrganizationId,
        isAdminManaging,
      }}
    >
      {children}
    </AdminBandSelectionContext.Provider>
  );
}

export function AdminBandPickerCard() {
  const { organizationId, setOrganizationId, isAdminManaging } = useAdminBandSelection();
  const bands = useQuery(
    api.users.listBandOrganizationsAdmin,
    isAdminManaging ? { includeArchived: false } : "skip",
  );

  const options = useMemo(
    () =>
      (bands ?? []).map((band) => ({
        value: band.organizationId,
        label: band.displayName || band.name,
        description: band.displayName && band.displayName !== band.name ? band.name : undefined,
        keywords: `${band.displayName} ${band.name} ${band.slug}`,
      })),
    [bands],
  );

  useEffect(() => {
    if (!isAdminManaging || !bands?.length) return;
    const selectedStillExists = Boolean(
      organizationId && bands.some((band) => band.organizationId === organizationId),
    );
    if (selectedStillExists) return;
    setOrganizationId(bands[0].organizationId);
  }, [bands, isAdminManaging, organizationId, setOrganizationId]);

  if (!isAdminManaging) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Manage a band</CardTitle>
        <CardDescription>
          Pick any band organization to edit its profile or technical riders. You do not need to
          join the organization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {bands === undefined ? (
          <p className="text-sm text-muted-foreground">Loading bands…</p>
        ) : bands.length === 0 ? (
          <p className="text-sm text-muted-foreground">No band organizations yet.</p>
        ) : (
          <div className="max-w-md" data-testid="admin-band-picker">
            <SearchableSelect
              value={organizationId ?? ""}
              onChange={setOrganizationId}
              options={options}
              placeholder="Select a band"
              emptyLabel="No matching bands"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

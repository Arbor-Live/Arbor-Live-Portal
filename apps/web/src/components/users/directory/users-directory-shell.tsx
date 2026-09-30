"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BuildingsIcon,
  EnvelopeSimpleIcon,
  PlusIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import {
  USERS_DIRECTORY_TABS,
  USERS_DIRECTORY_TAB_LABELS,
  activeUsersTabFromPathname,
  getUsersDirectoryTabPath,
  type UsersDirectoryTabId,
} from "@/lib/users-directory-tabs";
import { PageHeader, PageTabs } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { AddPersonDialog } from "@/components/users/directory/add-person-dialog";
import { CreateOrganizationDialog } from "@/components/users/directory/create-organization-dialog";
import { ALL_ORGS, findArborLiveOrgId, type OrgOption } from "@/components/users/directory/shared";

const TAB_ICONS: Record<UsersDirectoryTabId, Icon> = {
  people: UsersThreeIcon,
  invitations: EnvelopeSimpleIcon,
  organizations: BuildingsIcon,
};

type UsersDirectoryContextValue = {
  /** Undefined while loading. */
  orgOptions: OrgOption[] | undefined;
  /** The People / Invitations organization filter: an org id or `ALL_ORGS`. */
  orgFilter: string;
  setOrgFilter: (value: string) => void;
  /** The org id the filter points at, or `undefined` for all organizations. */
  filterOrgId: string | undefined;
  openAddPerson: () => void;
};

const UsersDirectoryContext = createContext<UsersDirectoryContextValue | null>(null);

export function useUsersDirectory() {
  const value = useContext(UsersDirectoryContext);
  if (!value) throw new Error("useUsersDirectory must be used inside UsersDirectoryShell.");
  return value;
}

/**
 * The Users page: one header, route-based tabs (People · Invitations ·
 * Organizations), and the state the tabs share — the organization filter and
 * the Add person / New organization dialogs.
 */
export function UsersDirectoryShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeTab = activeUsersTabFromPathname(pathname);
  const organizations = useQuery(api.users.listOrganizationsAdmin, {});
  const pendingInvites = useQuery(api.users.listInvitationsAdmin, { status: "pending" });
  const backfillDefaults = useMutation(api.users.backfillUserAdminDefaults);

  const [orgFilterChoice, setOrgFilter] = useState<string | null>(null);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  // Default to Arbor Live, the org most people belong to, once the list loads.
  const defaultOrgId = organizations ? findArborLiveOrgId(organizations) || ALL_ORGS : ALL_ORGS;
  const orgFilter = orgFilterChoice ?? defaultOrgId;
  const filterOrgId = orgFilter === ALL_ORGS ? undefined : orgFilter;

  const context = useMemo<UsersDirectoryContextValue>(
    () => ({
      orgOptions: organizations,
      orgFilter,
      setOrgFilter,
      filterOrgId,
      openAddPerson: () => setAddPersonOpen(true),
    }),
    [organizations, orgFilter, filterOrgId],
  );

  async function onBackfillDefaults() {
    try {
      await backfillDefaults({});
      notify.success("Backfill started for existing users.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  const pendingCount = pendingInvites?.length ?? 0;

  return (
    <UsersDirectoryContext.Provider value={context}>
      <div className="space-y-4 pb-24" data-testid="users-directory">
        <PageHeader
          title="Users"
          description="People with portal access, their pending invitations, and the organizations they belong to."
          actions={
            activeTab === "organizations" ? (
              <Button type="button" size="sm" onClick={() => setCreateOrgOpen(true)}>
                <PlusIcon />
                New organization
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => setAddPersonOpen(true)}>
                <PlusIcon />
                Add person
              </Button>
            )
          }
          menu={
            <>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/users/crew-rates">Crew rates</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/timecards">Crew timecards</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/users/crew-applications">Crew applications</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/users/artist-applications">Artist applications</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void onBackfillDefaults()}>
                Backfill existing users to defaults
              </DropdownMenuItem>
            </>
          }
        />
        <PageTabs
          label="Users sections"
          tabs={USERS_DIRECTORY_TABS.map((tab) => ({
            href: getUsersDirectoryTabPath(tab),
            label: USERS_DIRECTORY_TAB_LABELS[tab],
            icon: TAB_ICONS[tab],
            active: tab === activeTab,
            badge:
              tab === "invitations" && pendingCount > 0 ? (
                <span
                  className="bg-muted px-1.5 text-xs text-muted-foreground tabular-nums"
                  title={`${pendingCount} pending invitation${pendingCount === 1 ? "" : "s"}`}
                >
                  {pendingCount}
                </span>
              ) : undefined,
          }))}
        />
        {children}
      </div>
      {addPersonOpen ? (
        <AddPersonDialog
          open={addPersonOpen}
          onOpenChange={setAddPersonOpen}
          orgOptions={organizations ?? []}
          defaultOrgId={filterOrgId ?? (organizations ? findArborLiveOrgId(organizations) : "")}
        />
      ) : null}
      {createOrgOpen ? (
        <CreateOrganizationDialog open={createOrgOpen} onOpenChange={setCreateOrgOpen} />
      ) : null}
    </UsersDirectoryContext.Provider>
  );
}

/** The shared organization filter, for the People and Invitations filter bars. */
export function OrgFilterSelect() {
  const { orgOptions, orgFilter, setOrgFilter } = useUsersDirectory();
  const options = useMemo(
    () => [
      { value: ALL_ORGS, label: "All organizations" },
      ...(orgOptions ?? []).map((org) => ({ value: org.id, label: org.name })),
    ],
    [orgOptions],
  );
  return (
    <div className="w-full sm:w-60" data-testid="org-filter">
      <SearchableSelect
        value={orgFilter}
        onChange={(value) => setOrgFilter(value || ALL_ORGS)}
        options={options}
        placeholder="Search organizations…"
        emptyLabel="Organization"
      />
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createColumnHelper } from "@tanstack/react-table";
import { CheckIcon, CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { z } from "zod";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { TextFormField } from "@/components/forms/text-form-field";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { type DataTableFeatures } from "@/components/ui/data-table-features";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserRatesAdminClient } from "@/components/users/user-rates-admin-client";
import { useConvexForm } from "@/hooks/use-convex-form";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { useAppDialog } from "@/components/ui/app-dialog";
import { notify } from "@/lib/notify";
import {
  CREW_RATE_MODE_OPTIONS,
  PAYROLL_METHOD_OPTIONS,
  USER_DISCIPLINE_OPTIONS,
  USER_VERTICAL_OPTIONS,
  createUserAdminSchema,
  editInviteSchema,
  inviteUserSchema,
  userAdminRowSchema,
  type UserDisciplineOption,
  type UserVerticalOption,
  type CreateUserAdminFormValues,
  type EditInviteFormValues,
  type InviteUserFormValues,
  type UserAdminRowFormValues,
} from "@/lib/validations/users";

type MembershipDraft = {
  organizationId: string;
  role: string;
};

type OrgOption = {
  id: string;
  name: string;
  slug?: string;
  organizationType?: "arbor_internal" | "band" | "dj" | string;
};

type AdminUser = FunctionReturnType<typeof api.users.listUsersForAdmin>[number];

type BandOrgRow = FunctionReturnType<typeof api.users.listBandOrganizationsAdmin>[number];

type InviteRow = FunctionReturnType<typeof api.users.listInvitationsAdmin>[number];

type EditingInvite = {
  id: string;
  email: string;
  organizationId: string;
  role: string;
  verticals: UserVerticalOption[];
  disciplines: UserDisciplineOption[];
};

const userColumnHelper = createColumnHelper<DataTableFeatures, AdminUser>();
const inviteColumnHelper = createColumnHelper<DataTableFeatures, InviteRow>();
const bandOrgColumnHelper = createColumnHelper<DataTableFeatures, BandOrgRow>();

const NO_DEFAULT_ORG = "__none__";

function toggleOption<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function MembershipCheckboxes<T extends string>({
  label,
  options,
  values,
  onChange,
  idPrefix,
}: {
  label: string;
  options: readonly T[];
  values: T[];
  onChange: (next: T[]) => void;
  idPrefix: string;
}) {
  return (
    <div className="rounded-md border p-2">
      <p className="mb-2 text-xs font-medium">{label}</p>
      <div className="grid gap-1 md:grid-cols-2">
        {options.map((option) => (
          <label key={`${idPrefix}-${option}`} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={() => onChange(toggleOption(values, option))}
            />
            {option}
          </label>
        ))}
      </div>
    </div>
  );
}

function isArborOrg(orgOptions: OrgOption[], orgId: string) {
  const org = orgOptions.find((entry) => entry.id === orgId);
  if (!org) return false;
  if (org.organizationType === "arbor_internal") return true;
  const name = org.name.trim().toLowerCase();
  const slug = (org.slug ?? "").trim().toLowerCase();
  return name === "arbor live" || slug === "arbor-live";
}

function findArborLiveOrgId(orgOptions: OrgOption[]) {
  const byType = orgOptions.find((org) => org.organizationType === "arbor_internal");
  if (byType) return byType.id;
  const byName = orgOptions.find((org) => {
    const name = org.name.trim().toLowerCase();
    const slug = (org.slug ?? "").trim().toLowerCase();
    return name === "arbor live" || slug === "arbor-live";
  });
  return byName?.id ?? "";
}

function getRoleOptionsForOrg(orgOptions: OrgOption[], orgId: string) {
  if (isArborOrg(orgOptions, orgId)) {
    return [
      { value: "member", label: "Member" },
      { value: "admin", label: "Admin" },
    ];
  }
  return [
    { value: "org_member", label: "Org Member" },
    { value: "org_admin", label: "Org Admin" },
  ];
}

function userValuesFromRow(user: AdminUser, resolvedOrgId: string): UserAdminRowFormValues {
  return {
    role: user.role || "member",
    active: user.active,
    showOnPublicCrewPage: user.showOnPublicCrewPage ?? false,
    publicCrewDescription: user.publicCrewDescription ?? "",
    title: user.title || "",
    phone: user.phone || "",
    rateMode: (user.rateMode ?? "custom") as UserAdminRowFormValues["rateMode"],
    hourlyRateUsd: (user.customHourlyRateUsd ?? user.hourlyRateUsd ?? 0).toString(),
    payrollMethod: (user.payrollMethod ?? "stanford") as UserAdminRowFormValues["payrollMethod"],
    verticals: (user.verticals ?? []) as UserVerticalOption[],
    disciplines: (user.disciplines ?? []) as UserDisciplineOption[],
    defaultOrganizationId: user.defaultOrganizationId || resolvedOrgId,
  };
}

function bandOrgValuesFromRow(org: BandOrgRow) {
  return {
    displayName: org.displayName ?? "",
    performerHourlyRateUsd: String(org.performerHourlyRateUsd ?? 0),
  };
}

export function UsersManagementClient({
  view = "all",
}: {
  view?: "all" | "access" | "organizations";
}) {
  const { confirm } = useAppDialog();
  const organizations = useQuery(api.users.listOrganizationsAdmin, {});
  const [showArchivedBands, setShowArchivedBands] = useState(false);
  const bandOrganizations = useQuery(api.users.listBandOrganizationsAdmin, {
    includeArchived: showArchivedBands,
  });
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"all" | "pending" | "accepted" | "expired" | "cancelled">(
    "pending",
  );
  const orgOptions = useMemo(() => organizations ?? [], [organizations]);
  const defaultOrgId = useMemo(
    () => findArborLiveOrgId(orgOptions) || orgOptions[0]?.id || "",
    [orgOptions],
  );
  const resolvedOrgId = selectedOrganizationId || defaultOrgId;
  const users = useQuery(
    api.users.listUsersForAdmin,
    organizations === undefined
      ? "skip"
      : { organizationId: resolvedOrgId || undefined },
  );
  const crewOnboarding = useQuery(api.onboarding.listCrewOnboardingForAdmin, {});
  const waiveOnboarding = useMutation(api.onboarding.waiveCrewOnboarding);
  const invitations = useQuery(
    api.users.listInvitationsAdmin,
    organizations === undefined
      ? "skip"
      : {
          organizationId: resolvedOrgId || undefined,
          status: inviteStatus === "all" ? undefined : inviteStatus,
        },
  );
  const createOrganization = useMutation(api.users.createOrganizationAdmin);
  const inviteUser = useMutation(api.users.inviteUserAdmin);
  const resendInvite = useMutation(api.users.resendInviteAdmin);
  const updateInvite = useMutation(api.users.updateInviteAdmin);
  const cancelInvite = useMutation(api.users.cancelInviteAdmin);
  const createUser = useMutation(api.users.createUserAdmin);
  const sendPasswordReset = useMutation(api.users.sendPasswordResetAdmin);
  const setUserAccess = useMutation(api.users.setUserAccessAdmin);
  const backfillDefaults = useMutation(api.users.backfillUserAdminDefaults);
  const archiveBandOrganization = useMutation(api.users.archiveBandOrganizationAdmin);
  const unarchiveBandOrganization = useMutation(api.users.unarchiveBandOrganizationAdmin);
  const deleteArchivedBandOrganization = useMutation(api.users.deleteArchivedBandOrganizationAdmin);

  const [organizationName, setOrganizationName] = useState("");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editingInvite, setEditingInvite] = useState<EditingInvite | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [expandedUserIds, setExpandedUserIds] = useState<Record<string, boolean>>({});
  const [onboardingFilter, setOnboardingFilter] = useState<"all" | "incomplete">("all");
  const [accessFilter, setAccessFilter] = useState<"active" | "removed" | "all">("active");
  const showOrganizations = view === "all" || view === "organizations";
  const showAccess = view === "all" || view === "access";
  const showRates = view === "all";

  const onboardingByUserId = useMemo(() => {
    const map = new Map<string, NonNullable<typeof crewOnboarding>[number]>();
    for (const row of crewOnboarding ?? []) {
      map.set(row.userId, row);
    }
    return map;
  }, [crewOnboarding]);

  const filteredUsers = useMemo(() => {
    let list = users ?? [];
    if (accessFilter === "active") {
      list = list.filter((user) => user.active && !user.banned);
    } else if (accessFilter === "removed") {
      list = list.filter((user) => !user.active || user.banned);
    }
    if (onboardingFilter !== "incomplete") return list;
    return list.filter((user) => {
      const row = onboardingByUserId.get(user.id);
      if (!row) return true;
      return row.status === "not_started" || row.status === "in_progress";
    });
  }, [users, accessFilter, onboardingFilter, onboardingByUserId]);

  const bandOrgColumns = useMemo(
    () =>
      bandOrgColumnHelper.columns([
        bandOrgColumnHelper.accessor("name", {
          id: "band",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Band" />,
        }),
        bandOrgColumnHelper.accessor((row) => row.displayName ?? "", {
          id: "displayName",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Display Name" />,
        }),
        bandOrgColumnHelper.accessor((row) => row.performerHourlyRateUsd ?? 0, {
          id: "performerRate",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Performer Rate" />,
          sortFn: "basic",
        }),
        bandOrgColumnHelper.display({
          id: "options",
          enableSorting: false,
          header: "Options",
        }),
      ]),
    [],
  );

  const userColumns = useMemo(
    () =>
      userColumnHelper.columns([
        userColumnHelper.accessor("name", {
          id: "name",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        }),
        userColumnHelper.accessor("email", {
          id: "email",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
        }),
        userColumnHelper.accessor("role", {
          id: "role",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
        }),
        userColumnHelper.display({
          id: "onboarding",
          enableSorting: false,
          header: "Onboarding",
        }),
        userColumnHelper.accessor("active", {
          id: "active",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Active" />,
        }),
        userColumnHelper.display({
          id: "options",
          enableSorting: false,
          header: "Options",
        }),
      ]),
    [],
  );

  const inviteColumns = useMemo(
    () =>
      inviteColumnHelper.columns([
        inviteColumnHelper.accessor("email", {
          id: "email",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
        }),
        inviteColumnHelper.accessor("organizationName", {
          id: "organization",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Organization" />,
        }),
        inviteColumnHelper.accessor("role", {
          id: "role",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
        }),
        inviteColumnHelper.accessor("status", {
          id: "status",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        }),
        inviteColumnHelper.display({
          id: "action",
          enableSorting: false,
          enableHiding: false,
          header: "Action",
          cell: ({ row }) => {
            const invite = row.original;
            if (invite.status !== "pending") {
              return <span className="text-xs text-muted-foreground">—</span>;
            }
            return (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => openEditInvite(invite)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void onResendInvite(invite.id)}
                >
                  Resend
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void onCancelInvite(invite)}
                >
                  Cancel
                </Button>
              </div>
            );
          },
        }),
      ]),
    // openEditInvite / onResendInvite / onCancelInvite defined below; stable enough for admin list
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function onCreateOrganization() {
    if (!organizationName.trim()) return;
    try {
      const created = await createOrganization({ name: organizationName.trim() });
      setOrganizationName("");
      setSelectedOrganizationId(created.id);
      notify.success(`Created organization ${created.name}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  function openEditInvite(invite: NonNullable<typeof invitations>[number]) {
    setEditingInvite({
      id: invite.id,
      email: invite.email,
      organizationId: invite.organizationId,
      role: invite.role,
      verticals: (invite.verticals ?? []) as UserVerticalOption[],
      disciplines: (invite.disciplines ?? []) as UserDisciplineOption[],
    });
  }

  async function onCancelInvite(invite: NonNullable<typeof invitations>[number]) {
    if (!(await confirm({ title: `Cancel the invitation for ${invite.email}?`, confirmLabel: "Cancel invitation" }))) return;
    try {
      await cancelInvite({ invitationId: invite.id });
      notify.success(`Invitation cancelled for ${invite.email}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  async function onResendInvite(invitationId: string) {
    try {
      await resendInvite({ invitationId });
      notify.success("Invite resent.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  async function onUserPasswordReset(user: AdminUser) {
    try {
      await sendPasswordReset({ userId: user.id });
      notify.success(`Password reset sent for ${user.name}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  async function onSetUserAccess(user: AdminUser, removed: boolean) {
    const action = removed ? "Remove access for" : "Reactivate";
    if (
      !(await confirm({
        title: `${action} ${user.name}?`,
        confirmLabel: removed ? "Remove access" : "Reactivate",
        destructive: removed,
      }))
    ) {
      return;
    }
    try {
      await setUserAccess({ userId: user.id, removed });
      notify.success(removed ? `Removed access for ${user.name}.` : `Reactivated ${user.name}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  async function onArchiveBandOrganization(org: BandOrgRow) {
    if (
      !(await confirm({
        title: `Archive ${org.displayName || org.name}?`,
        description: "Members with no other active organization will lose access.",
        confirmLabel: "Archive",
      }))
    ) {
      return;
    }
    try {
      const result = await archiveBandOrganization({ organizationId: org.organizationId });
      notify.success(
        result.deactivatedUserIds.length > 0
          ? `Archived ${org.displayName || org.name}. Deactivated ${result.deactivatedUserIds.length} user(s) with no remaining access.`
          : `Archived ${org.displayName || org.name}.`,
      );
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  async function onUnarchiveBandOrganization(org: BandOrgRow) {
    try {
      await unarchiveBandOrganization({ organizationId: org.organizationId });
      notify.success(`Restored ${org.displayName || org.name} from archive.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  async function onDeleteArchivedBandOrganization(org: BandOrgRow) {
    if (
      !(await confirm({
        title: `Permanently delete ${org.displayName || org.name}?`,
        description: "This removes memberships, onboarding, and event participation records. This cannot be undone.",
        destructive: true,
      }))
    ) {
      return;
    }
    try {
      await deleteArchivedBandOrganization({ organizationId: org.organizationId });
      notify.success(`Deleted ${org.displayName || org.name}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  const onBackfillDefaults = async () => {
    try {
      await backfillDefaults({});
      notify.success("Backfill started for existing users.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }


  return (
    <div className="space-y-4 pb-24">

      {showOrganizations ? (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <CardTitle>Band Organizations</CardTitle>
              <p className="text-sm font-normal text-muted-foreground">
                Quick rate and archive controls. Full profile, payee, and riders live under{" "}
                <Link href="/dashboard/bands-and-performers" className="underline">
                  Bands and Performers
                </Link>
                .
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <input
                type="checkbox"
                checked={showArchivedBands}
                onChange={(e) => setShowArchivedBands(e.target.checked)}
              />
              Show archived
            </label>
          </CardHeader>
          <CardContent className="space-y-3">
            <DataTable
              columns={bandOrgColumns}
              data={bandOrganizations ?? []}
              getRowId={(row) => row.organizationId}
              emptyMessage={
                bandOrganizations === undefined ? "Loading…" : "None found yet."
              }
              renderRow={(row) => (
                <BandOrgAdminRow
                  org={row.original}
                  onArchive={() => void onArchiveBandOrganization(row.original)}
                  onUnarchive={() => void onUnarchiveBandOrganization(row.original)}
                  onDeleteArchived={() => void onDeleteArchivedBandOrganization(row.original)}
                />
              )}
            />
          </CardContent>
        </Card>
      ) : null}

      {showOrganizations ? (
        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setInviteModalOpen(true)}>
                Invite User
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(true)}>
                Create User
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_220px]">
              <Input
                placeholder="New organization name"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
              />
              <Button type="button" onClick={() => void onCreateOrganization()}>
                Create Organization
              </Button>
            </div>
            <div className="space-y-1">
              <Label>Current organization</Label>
              <Select value={resolvedOrgId} onValueChange={setSelectedOrganizationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgOptions.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" onClick={() => void onBackfillDefaults()}>
              Backfill Existing Users to Defaults
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {showAccess ? (
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1 space-y-1">
                <Label>Organization</Label>
                <Select value={resolvedOrgId} onValueChange={setSelectedOrganizationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgOptions.map((org) => (
                      <SelectItem key={`access-org-${org.id}`} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={() => setInviteModalOpen(true)}>
                Invite User
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(true)}>
                Create User
              </Button>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="max-w-[240px] space-y-1">
                <Label>Access</Label>
                <Select
                  value={accessFilter}
                  onValueChange={(value) => setAccessFilter(value as "active" | "removed" | "all")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="removed">Removed</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="max-w-[240px] space-y-1">
                <Label>Onboarding</Label>
                <Select
                  value={onboardingFilter}
                  onValueChange={(value) => setOnboardingFilter(value as "all" | "incomplete")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="incomplete">Incomplete only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DataTable
              columns={userColumns}
              data={filteredUsers}
              getRowId={(row) => row.id}
              initialSorting={[{ id: "name", desc: false }]}
              emptyMessage={users === undefined ? "Loading users..." : "No users match these filters."}
              renderRow={(row) => {
                const user = row.original;
                return (
                  <UserAdminRow
                    user={user}
                    onboarding={onboardingByUserId.get(user.id) ?? null}
                    orgOptions={orgOptions}
                    resolvedOrgId={resolvedOrgId}
                    expanded={Boolean(expandedUserIds[user.id])}
                    onToggleExpanded={() =>
                      setExpandedUserIds((prev) => ({ ...prev, [user.id]: !prev[user.id] }))
                    }
                    onPasswordReset={() => void onUserPasswordReset(user)}
                    onSetAccess={(removed) => void onSetUserAccess(user, removed)}
                    onWaiveOnboarding={async () => {
                      try {
                        await waiveOnboarding({ userId: user.id });
                        notify.success(`Waived onboarding for ${user.name}.`);
                      } catch (error) {
                        notify.error(getConvexErrorMessage(error));
                      }
                    }}
                    onMessage={notify.success}
                  />
                );
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {showAccess ? (
        <Card>
          <CardHeader>
            <CardTitle>Invitations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="max-w-[240px] space-y-1">
                <Label>Status Filter</Label>
                <Select
                  value={inviteStatus}
                  onValueChange={(value) =>
                    setInviteStatus(value as "all" | "pending" | "accepted" | "expired" | "cancelled")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="pb-2 text-xs text-muted-foreground">
                Filtered to the organization selected above. Accepted and cancelled invites are hidden
                unless you change the status filter.
              </p>
            </div>
            <DataTable
              columns={inviteColumns}
              data={invitations ?? []}
              getRowId={(row) => row.id}
              enableColumnVisibility
              initialSorting={[{ id: "email", desc: false }]}
              emptyMessage="No invites for this organization yet."
              getRowProps={(row) => ({
                "data-testid": `invite-row-${row.original.id}`,
              })}
            />
          </CardContent>
        </Card>
      ) : null}

      {showRates ? <UserRatesAdminClient /> : null}

      {showAccess && inviteModalOpen ? (
        <InviteUserModal
          orgId={resolvedOrgId}
          orgOptions={orgOptions}
          onClose={() => setInviteModalOpen(false)}
          onInvited={() => {
            setInviteModalOpen(false);
            notify.success("Invite sent.");
          }}
          inviteUser={inviteUser}
        />
      ) : null}

      {showAccess && editingInvite ? (
        <EditInviteModal
          invite={editingInvite}
          orgOptions={orgOptions}
          onClose={() => setEditingInvite(null)}
          onSaved={() => {
            setEditingInvite(null);
            notify.success("Invitation updated.");
          }}
          updateInvite={updateInvite}
        />
      ) : null}

      {showAccess && createModalOpen ? (
        <CreateUserModal
          orgId={resolvedOrgId}
          orgOptions={orgOptions}
          onClose={() => setCreateModalOpen(false)}
          onCreated={() => {
            setCreateModalOpen(false);
            notify.success("User created.");
          }}
          createUser={createUser}
        />
      ) : null}
    </div>
  );
}

function SaveStatusIcon({ saveStatus, saveError }: { saveStatus: string; saveError: string | null }) {
  if (saveStatus === "saving") {
    return <CircleNotchIcon className="size-4 animate-spin text-muted-foreground" />;
  }
  if (saveStatus === "error") {
    return (
      <WarningCircleIcon
        className="size-4 text-destructive"
        weight="fill"
        aria-label={saveError ?? "Save failed"}
      />
    );
  }
  if (saveStatus === "saved") {
    return <CheckIcon className="size-4 text-emerald-600" weight="bold" />;
  }
  return null;
}

function isUserRemoved(user: AdminUser) {
  return !user.active || user.banned;
}

function UserAdminRow({
  user,
  onboarding,
  orgOptions,
  resolvedOrgId,
  expanded,
  onToggleExpanded,
  onPasswordReset,
  onSetAccess,
  onWaiveOnboarding,
  onMessage,
}: {
  user: AdminUser;
  onboarding: NonNullable<ReturnType<typeof useQuery<typeof api.onboarding.listCrewOnboardingForAdmin>>>[number] | null;
  orgOptions: OrgOption[];
  resolvedOrgId: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onPasswordReset: () => void;
  onSetAccess: (removed: boolean) => void;
  onWaiveOnboarding: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const { alert } = useAppDialog();
  const updateUser = useMutation(api.users.updateUserAdmin);
  const addMembership = useMutation(api.users.addUserOrganizationMembershipAdmin);
  const removeMembership = useMutation(api.users.removeUserOrganizationMembershipAdmin);
  const removed = isUserRemoved(user);
  const [membershipDraft, setMembershipDraft] = useState<MembershipDraft>({
    organizationId: "",
    role: "org_member",
  });

  const form = useConvexForm<UserAdminRowFormValues>({
    schema: userAdminRowSchema,
    defaultValues: userValuesFromRow(user, resolvedOrgId),
    mode: "onChange",
  });

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset(userValuesFromRow(user, resolvedOrgId));
  }, [user, resolvedOrgId, form]);

  const persist = async (values: UserAdminRowFormValues) => {
    await updateUser({
      userId: user.id,
      role: values.role,
      active: values.active,
      showOnPublicCrewPage: values.showOnPublicCrewPage,
      publicCrewDescription: values.publicCrewDescription || undefined,
      title: values.title || undefined,
      phone: values.phone || undefined,
      verticals: values.verticals,
      disciplines: values.disciplines,
      defaultOrganizationId: values.defaultOrganizationId || undefined,
      rateMode: values.rateMode,
      customHourlyRateUsd: values.rateMode === "custom" ? Number(values.hourlyRateUsd || "0") : undefined,
      payrollMethod: values.payrollMethod,
      organizationMemberships: values.defaultOrganizationId
        ? [
            {
              organizationId: values.defaultOrganizationId,
              role: values.role,
              active: values.active,
            },
          ]
        : undefined,
    });
  };

  const onSave = form.submitMutation(
    async (values) => {
      await persist(values);
      return values;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
      },
    },
  );

  async function onAddMembership() {
    if (!membershipDraft.organizationId) {
      await alert("Select an organization to add.");
      return;
    }
    const alreadyExists = user.organizationMemberships.some(
      (membership) => membership.organizationId === membershipDraft.organizationId,
    );
    if (alreadyExists) {
      await alert("User already has membership in this organization.");
      return;
    }
    try {
      await addMembership({
        userId: user.id,
        organizationId: membershipDraft.organizationId,
        role: membershipDraft.role,
        active: true,
      });
      setMembershipDraft({ organizationId: "", role: "org_member" });
      onMessage(`Added membership for ${user.name}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  async function onRemoveMembership(organizationId: string) {
    const defaultOrg = form.getValues("defaultOrganizationId");
    if (defaultOrg === organizationId) {
      await alert("Change default organization before removing this membership.");
      return;
    }
    try {
      await removeMembership({ userId: user.id, organizationId });
      onMessage(`Removed membership for ${user.name}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  return (
    <>
      <tr
        data-testid={`user-row-${user.id}`}
        className={`border-b align-top ${removed ? "text-muted-foreground" : ""}`}
      >
        <td className="px-3 py-2">{user.name}</td>
        <td className="px-3 py-2">{user.email}</td>
        <td className="px-3 py-2">
          <Select
            value={form.watch("role")}
            onValueChange={(value) => form.setValue("role", value, { shouldDirty: true })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </td>
        <td className="px-3 py-2">
          {onboarding ? (
            <div className="space-y-1 text-xs">
              <p className="font-medium capitalize">{onboarding.status.replace("_", " ")}</p>
              {onboarding.status === "not_started" || onboarding.status === "in_progress" ? (
                <p className="text-muted-foreground">{onboarding.incompleteStepCount} left</p>
              ) : null}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.watch("active")}
                onChange={(e) => form.setValue("active", e.target.checked, { shouldDirty: true })}
              />
              Active
            </label>
            {removed ? <p className="text-xs text-muted-foreground">Removed</p> : null}
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {form.formState.isDirty ? (
              <Button
                type="button"
                size="sm"
                disabled={form.saveStatus === "saving"}
                onClick={() => void form.handleSubmit(onSave)()}
              >
                Save
              </Button>
            ) : null}
            <Select
              value=""
              onValueChange={(action) => {
                if (action === "reset") onPasswordReset();
                if (action === "toggle_details") onToggleExpanded();
                if (action === "waive") void onWaiveOnboarding();
                if (action === "remove_access") onSetAccess(true);
                if (action === "reactivate") onSetAccess(false);
              }}
            >
              <SelectTrigger className="min-w-[140px]">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reset">Reset Password</SelectItem>
                <SelectItem value="toggle_details">{expanded ? "Hide details" : "Show details"}</SelectItem>
                {onboarding &&
                (onboarding.status === "not_started" || onboarding.status === "in_progress") ? (
                  <SelectItem value="waive">Waive onboarding</SelectItem>
                ) : null}
                {removed ? (
                  <SelectItem value="reactivate">Reactivate</SelectItem>
                ) : (
                  <SelectItem value="remove_access">Remove access</SelectItem>
                )}
              </SelectContent>
            </Select>
            <SaveStatusIcon saveStatus={form.saveStatus} saveError={form.saveError} />
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr data-testid={`user-details-${user.id}`} className="border-b bg-muted/20">
          <td className="px-3 py-2 text-xs text-muted-foreground">Details</td>
          <td className="px-3 py-2" colSpan={5}>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input
                  value={form.watch("title")}
                  onChange={(e) => form.setValue("title", e.target.value, { shouldDirty: true })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={form.watch("phone")}
                  onChange={(e) => form.setValue("phone", e.target.value, { shouldDirty: true })}
                />
              </div>
              <div data-testid={`user-rate-${user.id}`} className="space-y-1">
                <Label className="text-xs">Hourly rate</Label>
                <Select
                  value={form.watch("rateMode")}
                  onValueChange={(value) =>
                    form.setValue(
                      "rateMode",
                      value as (typeof CREW_RATE_MODE_OPTIONS)[number],
                      { shouldDirty: true },
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {form.watch("rateMode") === "custom" ? (
                  <Input
                    value={form.watch("hourlyRateUsd")}
                    onChange={(e) => form.setValue("hourlyRateUsd", e.target.value, { shouldDirty: true })}
                    placeholder="USD"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    ${user.hourlyRateUsd ?? 0}/hr (synced)
                  </p>
                )}
                <Select
                  value={form.watch("payrollMethod")}
                  onValueChange={(value) =>
                    form.setValue(
                      "payrollMethod",
                      value as (typeof PAYROLL_METHOD_OPTIONS)[number],
                      { shouldDirty: true },
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stanford">Stanford</SelectItem>
                    <SelectItem value="external">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Default organization</Label>
                <Select
                  value={form.watch("defaultOrganizationId") || NO_DEFAULT_ORG}
                  onValueChange={(value) =>
                    form.setValue(
                      "defaultOrganizationId",
                      value === NO_DEFAULT_ORG ? "" : value,
                      { shouldDirty: true },
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEFAULT_ORG}>No default org</SelectItem>
                    {orgOptions.map((org) => (
                      <SelectItem key={`user-org-${user.id}-${org.id}`} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {onboarding ? (
                <div className="rounded-md border p-2 md:col-span-2">
                  <p className="mb-2 text-xs font-medium">Onboarding checklist</p>
                  <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <li>Profile: {onboarding.profileCompletedAt ? "done" : "pending"}</li>
                    <li>WhatsApp: {onboarding.whatsappAcknowledgedAt ? "done" : "pending"}</li>
                    <li>Instagram: {onboarding.instagramAcknowledgedAt ? "done" : "pending"}</li>
                    <li>
                      FWS:{" "}
                      {onboarding.fwsAcknowledgedAt
                        ? onboarding.hasFederalWorkStudy
                          ? "yes"
                          : "no"
                        : "pending"}
                    </li>
                    <li>Narcan: {onboarding.narcanCompletedAt ? "done" : "pending"}</li>
                    <li>Sober monitor: {onboarding.soberMonitorCompletedAt ? "done" : "pending"}</li>
                    <li>Emergency SOPs: {onboarding.emergencySopsAcknowledgedAt ? "done" : "pending"}</li>
                    <li>Expectations: {onboarding.crewExpectationsAcknowledgedAt ? "done" : "pending"}</li>
                    <li>Lifting: {onboarding.liftingCompletedAt ? "done" : "pending"}</li>
                    <li>Cart: {onboarding.cartTrainingCompletedAt ? "done" : "n/a or pending"}</li>
                    <li>OSE hiring: {onboarding.oseHiringFormCompletedAt ? "done" : "pending"}</li>
                    <li>Timecard: {onboarding.timecardAcknowledgedAt ? "done" : "pending"}</li>
                    <li>Signed: {onboarding.agreedToOnboardingDocAt ? onboarding.signatureLegalName ?? "yes" : "pending"}</li>
                  </ul>
                </div>
              ) : null}
              <MembershipCheckboxes
                label="Verticals"
                options={USER_VERTICAL_OPTIONS}
                values={form.watch("verticals")}
                onChange={(next) => form.setValue("verticals", next, { shouldDirty: true })}
                idPrefix={`user-${user.id}-vertical`}
              />
              <MembershipCheckboxes
                label="Disciplines"
                options={USER_DISCIPLINE_OPTIONS}
                values={form.watch("disciplines")}
                onChange={(next) => form.setValue("disciplines", next, { shouldDirty: true })}
                idPrefix={`user-${user.id}-discipline`}
              />
              <div className="rounded-md border p-2 md:col-span-2">
                <p className="mb-2 text-xs font-medium">Public crew page</p>
                <label className="mb-3 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={form.watch("showOnPublicCrewPage")}
                    onChange={(e) =>
                      form.setValue("showOnPublicCrewPage", e.target.checked, { shouldDirty: true })
                    }
                  />
                  Show on public crew page
                </label>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor={`public-crew-description-${user.id}`} className="text-xs">
                      Description
                    </Label>
                    <textarea
                      id={`public-crew-description-${user.id}`}
                      rows={3}
                      value={form.watch("publicCrewDescription")}
                      onChange={(e) =>
                        form.setValue("publicCrewDescription", e.target.value, { shouldDirty: true })
                      }
                      placeholder="Short bio shown on the public crew page."
                      className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                </div>
              </div>
              <div data-testid={`user-memberships-${user.id}`} className="rounded-md border p-2">
                <p className="mb-2 text-xs font-medium">Organization Memberships</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {user.organizationMemberships.map((membership) => (
                    <div key={`${user.id}-${membership.organizationId}`} className="flex items-center gap-1">
                      <span>
                        {membership.organizationName} ({membership.role})
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void onRemoveMembership(membership.organizationId)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid gap-1">
                  <Select
                    value={membershipDraft.organizationId || NO_DEFAULT_ORG}
                    onValueChange={(value) => {
                      const nextOrgId = value === NO_DEFAULT_ORG ? "" : value;
                      const roleOptions = getRoleOptionsForOrg(orgOptions, nextOrgId);
                      setMembershipDraft({
                        organizationId: nextOrgId,
                        role: roleOptions[0]?.value ?? "org_member",
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Add membership org..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_DEFAULT_ORG}>Add membership org...</SelectItem>
                      {orgOptions.map((org) => (
                        <SelectItem key={`membership-org-${user.id}-${org.id}`} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={membershipDraft.role}
                    onValueChange={(value) => setMembershipDraft((prev) => ({ ...prev, role: value }))}
                    disabled={!membershipDraft.organizationId}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getRoleOptionsForOrg(orgOptions, membershipDraft.organizationId).map((option) => (
                        <SelectItem key={`${user.id}-role-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" onClick={() => void onAddMembership()}>
                    Add Membership
                  </Button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function BandOrgAdminRow({
  org,
  onArchive,
  onUnarchive,
  onDeleteArchived,
}: {
  org: BandOrgRow;
  onArchive: () => void;
  onUnarchive: () => void;
  onDeleteArchived: () => void;
}) {
  const isArchived = org.status === "archived";
  const updateBandOrganizationProfileAdmin = useMutation(api.users.updateBandOrganizationProfileAdmin);

  const form = useConvexForm({
    schema: z.object({
      displayName: z.string(),
      performerHourlyRateUsd: z.string(),
    }),
    defaultValues: bandOrgValuesFromRow(org),
    mode: "onChange",
  });

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset(bandOrgValuesFromRow(org));
  }, [org, form]);

  const onSave = form.submitMutation(
    async (values) => {
      await updateBandOrganizationProfileAdmin({
        organizationId: org.organizationId,
        displayName: values.displayName || undefined,
        performerHourlyRateUsd: Number(values.performerHourlyRateUsd || "0"),
      });
      return values;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
      },
    },
  );

  return (
    <tr className="border-b align-top">
      <td className="px-3 py-2">
        <p className="font-medium">
          {org.name}
          {isArchived ? (
            <span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
              Archived
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">/{org.slug}</p>
      </td>
      <td className="px-3 py-2">
        <Input
          value={form.watch("displayName")}
          onChange={(e) => form.setValue("displayName", e.target.value, { shouldDirty: true })}
        />
      </td>
      <td className="px-3 py-2">
        <Input
          inputMode="decimal"
          value={form.watch("performerHourlyRateUsd")}
          onChange={(e) =>
            form.setValue("performerHourlyRateUsd", e.target.value, { shouldDirty: true })
          }
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {form.formState.isDirty ? (
            <Button
              type="button"
              size="sm"
              disabled={form.saveStatus === "saving" || isArchived}
              onClick={() => void form.handleSubmit(onSave)()}
            >
              Save
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href="/dashboard/bands-and-performers">Edit profile</Link>
          </Button>
          {isArchived ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={onUnarchive}>
                Restore
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={onDeleteArchived}>
                Delete permanently
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={onArchive}>
              Archive
            </Button>
          )}
          <SaveStatusIcon saveStatus={form.saveStatus} saveError={form.saveError} />
        </div>
      </td>
    </tr>
  );
}

function InviteUserModal({
  orgId,
  orgOptions,
  onClose,
  onInvited,
  inviteUser,
}: {
  orgId: string;
  orgOptions: OrgOption[];
  onClose: () => void;
  onInvited: () => void;
  inviteUser: ReturnType<typeof useMutation<typeof api.users.inviteUserAdmin>>;
}) {
  const form = useConvexForm<InviteUserFormValues>({
    schema: inviteUserSchema,
    defaultValues: {
      email: "",
      role: "member",
      verticals: [],
      disciplines: [],
      rateMode: "normal",
      customHourlyRateUsd: "0",
      payrollMethod: "stanford",
    },
    mode: "onTouched",
  });

  const arborInvite = isArborOrg(orgOptions, orgId);

  const onSubmit = form.submitMutation(async (values) => {
    if (!orgId) throw new Error("Create or select an organization first.");
    if (arborInvite && !values.rateMode) {
      throw new Error("Select a rate mode.");
    }
    if (arborInvite && !values.payrollMethod) {
      throw new Error("Select a payment method.");
    }
    await inviteUser({
      organizationId: orgId,
      email: values.email.trim(),
      role: values.role,
      verticals: values.verticals,
      disciplines: values.disciplines,
      rateMode: arborInvite ? values.rateMode : undefined,
      customHourlyRateUsd:
        arborInvite && values.rateMode === "custom"
          ? Number(values.customHourlyRateUsd || "0")
          : undefined,
      payrollMethod: arborInvite ? values.payrollMethod : undefined,
    });
    form.reset({
      email: "",
      role: "member",
      verticals: [],
      disciplines: [],
      rateMode: "normal",
      customHourlyRateUsd: "0",
      payrollMethod: "stanford",
    });
    onInvited();
  });

  return (
    <div
      data-testid="invite-user-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 pb-24"
    >
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Invite User</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2">
                <TextFormField name="email" label="Email" type="email" />
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select
                    value={form.watch("role")}
                    onValueChange={(value) => form.setValue("role", value, { shouldDirty: true })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getRoleOptionsForOrg(orgOptions, orgId).map((option) => (
                        <SelectItem key={`invite-role-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <MembershipCheckboxes
                  label="Verticals"
                  options={USER_VERTICAL_OPTIONS}
                  values={form.watch("verticals")}
                  onChange={(next) => form.setValue("verticals", next, { shouldDirty: true })}
                  idPrefix="invite-vertical"
                />
                <MembershipCheckboxes
                  label="Disciplines"
                  options={USER_DISCIPLINE_OPTIONS}
                  values={form.watch("disciplines")}
                  onChange={(next) => form.setValue("disciplines", next, { shouldDirty: true })}
                  idPrefix="invite-discipline"
                />
              </div>
              {arborInvite ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Rate</Label>
                    <Select
                      value={form.watch("rateMode") ?? "normal"}
                      onValueChange={(value) =>
                        form.setValue(
                          "rateMode",
                          value as (typeof CREW_RATE_MODE_OPTIONS)[number],
                          { shouldDirty: true },
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Payment method</Label>
                    <Select
                      value={form.watch("payrollMethod") ?? "stanford"}
                      onValueChange={(value) =>
                        form.setValue(
                          "payrollMethod",
                          value as (typeof PAYROLL_METHOD_OPTIONS)[number],
                          { shouldDirty: true },
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stanford">Stanford payroll</SelectItem>
                        <SelectItem value="external">External payroll</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.watch("rateMode") === "custom" ? (
                    <TextFormField name="customHourlyRateUsd" label="Custom hourly rate (USD)" />
                  ) : null}
                </div>
              ) : null}
              <div className="flex gap-2">
                <Button type="submit" disabled={form.saveStatus === "saving"}>
                  Send Invite
                </Button>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      <FormSaveBar
        tier="C"
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={form.formState.isDirty}
        saveLabel="Send Invite"
        onSave={() => void form.handleSubmit(onSubmit)()}
        onDiscard={() => {
          form.reset({
            email: "",
            role: "member",
            verticals: [],
            disciplines: [],
            rateMode: "normal",
            customHourlyRateUsd: "0",
            payrollMethod: "stanford",
          });
          onClose();
        }}
        onRetry={() => void form.handleSubmit(onSubmit)()}
      />
    </div>
  );
}

function EditInviteModal({
  invite,
  orgOptions,
  onClose,
  onSaved,
  updateInvite,
}: {
  invite: EditingInvite;
  orgOptions: OrgOption[];
  onClose: () => void;
  onSaved: () => void;
  updateInvite: ReturnType<typeof useMutation<typeof api.users.updateInviteAdmin>>;
}) {
  const form = useConvexForm<EditInviteFormValues>({
    schema: editInviteSchema,
    defaultValues: { role: invite.role, verticals: invite.verticals, disciplines: invite.disciplines },
    mode: "onTouched",
  });

  useEffect(() => {
    // Bail while dirty, as every other `useConvexForm` row does. `form` is in
    // the deps and `useConvexForm` returns a new object whenever `isDirty`
    // flips, so without this the first edit re-runs the effect and resets
    // itself away — the role could never actually be changed.
    if (form.formState.isDirty) return;
    form.reset({ role: invite.role, verticals: invite.verticals, disciplines: invite.disciplines });
  }, [invite, form]);

  const onSubmit = form.submitMutation(async (values) => {
    await updateInvite({
      invitationId: invite.id,
      role: values.role,
      verticals: isArborOrg(orgOptions, invite.organizationId) ? values.verticals : undefined,
      disciplines: isArborOrg(orgOptions, invite.organizationId) ? values.disciplines : undefined,
    });
    onSaved();
  });

  return (
    <div
      data-testid="edit-invite-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 pb-24"
    >
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Edit Invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input value={invite.email} disabled readOnly />
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div className="space-y-1">
                <Label>Role</Label>
                <Select
                  value={form.watch("role")}
                  onValueChange={(value) => form.setValue("role", value, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getRoleOptionsForOrg(orgOptions, invite.organizationId).map((option) => (
                      <SelectItem key={`edit-invite-role-${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isArborOrg(orgOptions, invite.organizationId) ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <MembershipCheckboxes
                    label="Verticals"
                    options={USER_VERTICAL_OPTIONS}
                    values={form.watch("verticals")}
                    onChange={(next) => form.setValue("verticals", next, { shouldDirty: true })}
                    idPrefix="edit-invite-vertical"
                  />
                  <MembershipCheckboxes
                    label="Disciplines"
                    options={USER_DISCIPLINE_OPTIONS}
                    values={form.watch("disciplines")}
                    onChange={(next) => form.setValue("disciplines", next, { shouldDirty: true })}
                    idPrefix="edit-invite-discipline"
                  />
                </div>
              ) : null}
              <div className="flex gap-2">
                <Button type="submit" disabled={form.saveStatus === "saving"}>
                  Save changes
                </Button>
                <Button type="button" variant="outline" onClick={onClose}>
                  Close
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      <FormSaveBar
        tier="C"
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={form.formState.isDirty}
        saveLabel="Save changes"
        onSave={() => void form.handleSubmit(onSubmit)()}
        onDiscard={() => {
          form.reset({ role: invite.role, verticals: invite.verticals, disciplines: invite.disciplines });
          onClose();
        }}
        onRetry={() => void form.handleSubmit(onSubmit)()}
      />
    </div>
  );
}

function CreateUserModal({
  orgId,
  orgOptions,
  onClose,
  onCreated,
  createUser,
}: {
  orgId: string;
  orgOptions: OrgOption[];
  onClose: () => void;
  onCreated: () => void;
  createUser: ReturnType<typeof useMutation<typeof api.users.createUserAdmin>>;
}) {
  const form = useConvexForm<CreateUserAdminFormValues>({
    schema: createUserAdminSchema,
    defaultValues: {
      name: "",
      title: "",
      email: "",
      password: "",
      role: "member",
      verticals: [],
      disciplines: [],
      rateMode: "normal",
      hourlyRateUsd: "0",
      payrollMethod: "stanford",
    },
    mode: "onTouched",
  });

  const arborCreate = isArborOrg(orgOptions, orgId);

  const onSubmit = form.submitMutation(async (values) => {
    if (!orgId) throw new Error("Create or select an organization first.");
    await createUser({
      organizationId: orgId,
      name: values.name.trim(),
      title: values.title.trim() || undefined,
      email: values.email.trim(),
      tempPassword: values.password,
      role: values.role,
      verticals: values.verticals,
      disciplines: values.disciplines,
      rateMode: arborCreate ? values.rateMode : undefined,
      customHourlyRateUsd:
        arborCreate && values.rateMode === "custom"
          ? Number(values.hourlyRateUsd || "0")
          : undefined,
      payrollMethod: arborCreate ? values.payrollMethod : undefined,
    });
    form.reset({
      name: "",
      title: "",
      email: "",
      password: "",
      role: "member",
      verticals: [],
      disciplines: [],
      rateMode: "normal",
      hourlyRateUsd: "0",
      payrollMethod: "stanford",
    });
    onCreated();
  });

  return (
    <div
      data-testid="create-user-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 pb-24"
    >
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Create User (Direct)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <TextFormField name="name" label="Name" />
                <TextFormField name="title" label="Title (optional)" />
                <TextFormField name="email" label="Email" type="email" />
                <TextFormField name="password" label="Temporary password" type="password" />
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select
                    value={form.watch("role")}
                    onValueChange={(value) => form.setValue("role", value, { shouldDirty: true })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getRoleOptionsForOrg(orgOptions, orgId).map((option) => (
                        <SelectItem key={`create-role-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {arborCreate ? (
                  <>
                    <div className="space-y-1">
                      <Label>Rate</Label>
                      <Select
                        value={form.watch("rateMode")}
                        onValueChange={(value) =>
                          form.setValue(
                            "rateMode",
                            value as (typeof CREW_RATE_MODE_OPTIONS)[number],
                            { shouldDirty: true },
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="lead">Lead</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.watch("rateMode") === "custom" ? (
                      <TextFormField name="hourlyRateUsd" label="Custom hourly rate (USD)" />
                    ) : (
                      <div className="space-y-1">
                        <Label>Effective rate</Label>
                        <p className="text-sm text-muted-foreground pt-2">
                          Uses global {form.watch("rateMode")} rate
                        </p>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label>Payment method</Label>
                      <Select
                        value={form.watch("payrollMethod")}
                        onValueChange={(value) =>
                          form.setValue(
                            "payrollMethod",
                            value as (typeof PAYROLL_METHOD_OPTIONS)[number],
                            { shouldDirty: true },
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stanford">Stanford payroll</SelectItem>
                          <SelectItem value="external">External payroll</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <MembershipCheckboxes
                  label="Verticals"
                  options={USER_VERTICAL_OPTIONS}
                  values={form.watch("verticals")}
                  onChange={(next) => form.setValue("verticals", next, { shouldDirty: true })}
                  idPrefix="create-vertical"
                />
                <MembershipCheckboxes
                  label="Disciplines"
                  options={USER_DISCIPLINE_OPTIONS}
                  values={form.watch("disciplines")}
                  onChange={(next) => form.setValue("disciplines", next, { shouldDirty: true })}
                  idPrefix="create-discipline"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={form.saveStatus === "saving"}>
                  Create User
                </Button>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      <FormSaveBar
        tier="C"
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={form.formState.isDirty}
        saveLabel="Create User"
        onSave={() => void form.handleSubmit(onSubmit)()}
        onDiscard={() => {
          form.reset({
            name: "",
            title: "",
            email: "",
            password: "",
            role: "member",
            verticals: [],
            disciplines: [],
            rateMode: "normal",
      hourlyRateUsd: "0",
      payrollMethod: "stanford",
          });
          onClose();
        }}
        onRetry={() => void form.handleSubmit(onSubmit)()}
      />
    </div>
  );
}

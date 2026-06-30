"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckIcon, CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { TextFormField } from "@/components/forms/text-form-field";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserRatesAdminClient } from "@/components/users/user-rates-admin-client";
import { useConvexForm } from "@/hooks/use-convex-form";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  ADMIN_TEAM_OPTIONS,
  bandOrgProfileSchema,
  createUserAdminSchema,
  editInviteSchema,
  inviteUserSchema,
  userAdminRowSchema,
  type AdminTeamOption,
  type BandOrgProfileFormValues,
  type CreateUserAdminFormValues,
  type EditInviteFormValues,
  type InviteUserFormValues,
  type UserAdminRowFormValues,
} from "@/lib/validations/users";

type MembershipDraft = {
  organizationId: string;
  role: string;
};

type OrgOption = { id: string; name: string; slug?: string };

type AdminUser = NonNullable<ReturnType<typeof useQuery<typeof api.users.listUsersForAdmin>>>[number];

type BandOrgRow = NonNullable<ReturnType<typeof useQuery<typeof api.users.listBandOrganizationsAdmin>>>[number];

type EditingInvite = {
  id: string;
  email: string;
  organizationId: string;
  role: string;
  teams: AdminTeamOption[];
};

const NO_DEFAULT_ORG = "__none__";

function toggleTeam(teams: AdminTeamOption[], team: AdminTeamOption) {
  return teams.includes(team) ? teams.filter((entry) => entry !== team) : [...teams, team];
}

function isArborOrg(orgOptions: OrgOption[], orgId: string) {
  const org = orgOptions.find((entry) => entry.id === orgId);
  if (!org) return false;
  const name = org.name.trim().toLowerCase();
  const slug = (org.slug ?? "").trim().toLowerCase();
  return name === "arbor live" || slug === "arbor-live";
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
    title: user.title || "",
    phone: user.phone || "",
    hourlyRateUsd: (user.hourlyRateUsd ?? 0).toString(),
    teams: (user.teams ?? []) as AdminTeamOption[],
    defaultOrganizationId: user.defaultOrganizationId || resolvedOrgId,
  };
}

function bandOrgValuesFromRow(org: BandOrgRow): BandOrgProfileFormValues {
  return {
    displayName: org.displayName ?? "",
    bio: org.bio ?? "",
    performerHourlyRateUsd: String(org.performerHourlyRateUsd ?? 0),
    publicWebsiteUrl: org.publicWebsiteUrl ?? "",
    publicInstagramUrl: org.publicInstagramUrl ?? "",
    publicYoutubeUrl: org.publicYoutubeUrl ?? "",
    publicListing: org.publicListing ?? false,
    publicSlug: org.publicSlug ?? "",
    publicHeroImageUrl: org.publicHeroImageUrl ?? "",
  };
}

export function UsersManagementClient({
  view = "all",
}: {
  view?: "all" | "access" | "organizations";
}) {
  const organizations = useQuery(api.users.listOrganizationsAdmin, {});
  const bandOrganizations = useQuery(api.users.listBandOrganizationsAdmin, {});
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"all" | "pending" | "accepted" | "expired" | "cancelled">("all");
  const users = useQuery(api.users.listUsersForAdmin, {
    organizationId: selectedOrganizationId || undefined,
  });
  const invitations = useQuery(api.users.listInvitationsAdmin, {
    organizationId: selectedOrganizationId || undefined,
    status: inviteStatus === "all" ? undefined : inviteStatus,
  });
  const createOrganization = useMutation(api.users.createOrganizationAdmin);
  const inviteUser = useMutation(api.users.inviteUserAdmin);
  const resendInvite = useMutation(api.users.resendInviteAdmin);
  const updateInvite = useMutation(api.users.updateInviteAdmin);
  const cancelInvite = useMutation(api.users.cancelInviteAdmin);
  const createUser = useMutation(api.users.createUserAdmin);
  const sendPasswordReset = useMutation(api.users.sendPasswordResetAdmin);
  const backfillDefaults = useMutation(api.users.backfillUserAdminDefaults);

  const [organizationName, setOrganizationName] = useState("");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editingInvite, setEditingInvite] = useState<EditingInvite | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedUserIds, setExpandedUserIds] = useState<Record<string, boolean>>({});
  const [expandedBandOrgIds, setExpandedBandOrgIds] = useState<Record<string, boolean>>({});
  const showOrganizations = view === "all" || view === "organizations";
  const showAccess = view === "all" || view === "access";
  const showRates = view === "all";

  const orgOptions = useMemo(() => organizations ?? [], [organizations]);
  const resolvedOrgId = selectedOrganizationId || orgOptions[0]?.id || "";

  async function onCreateOrganization() {
    if (!organizationName.trim()) return;
    try {
      const created = await createOrganization({ name: organizationName.trim() });
      setOrganizationName("");
      setSelectedOrganizationId(created.id);
      setMessage(`Created organization ${created.name}.`);
    } catch (error) {
      setMessage(getConvexErrorMessage(error));
    }
  }

  function openEditInvite(invite: NonNullable<typeof invitations>[number]) {
    setEditingInvite({
      id: invite.id,
      email: invite.email,
      organizationId: invite.organizationId,
      role: invite.role,
      teams: (invite.teams ?? []) as AdminTeamOption[],
    });
  }

  async function onCancelInvite(invite: NonNullable<typeof invitations>[number]) {
    if (!window.confirm(`Cancel the invitation for ${invite.email}?`)) return;
    try {
      await cancelInvite({ invitationId: invite.id });
      setMessage(`Invitation cancelled for ${invite.email}.`);
    } catch (error) {
      setMessage(getConvexErrorMessage(error));
    }
  }

  async function onResendInvite(invitationId: string) {
    try {
      await resendInvite({ invitationId });
      setMessage("Invite resent.");
    } catch (error) {
      setMessage(getConvexErrorMessage(error));
    }
  }

  async function onUserPasswordReset(user: AdminUser) {
    try {
      await sendPasswordReset({ userId: user.id });
      setMessage(`Password reset sent for ${user.name}.`);
    } catch (error) {
      setMessage(getConvexErrorMessage(error));
    }
  }

  const onBackfillDefaults = async () => {
    try {
      await backfillDefaults({});
      setMessage("Backfill started for existing users.");
    } catch (error) {
      setMessage(getConvexErrorMessage(error));
    }
  }


  return (
    <div className="space-y-4 pb-24">
      {message ? <p className="text-sm text-primary">{message}</p> : null}

      {showOrganizations ? (
        <Card>
          <CardHeader>
            <CardTitle>Band Organizations (Admin Birds-Eye View)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-3 py-2 font-medium">Band</th>
                    <th className="px-3 py-2 font-medium">Display Name</th>
                    <th className="px-3 py-2 font-medium">Performer Rate</th>
                    <th className="px-3 py-2 font-medium">Options</th>
                  </tr>
                </thead>
                <tbody>
                  {(bandOrganizations ?? []).map((org) => (
                    <BandOrgAdminRow
                      key={org.organizationId}
                      org={org}
                      expanded={Boolean(expandedBandOrgIds[org.organizationId])}
                      onToggleExpanded={() =>
                        setExpandedBandOrgIds((prev) => ({
                          ...prev,
                          [org.organizationId]: !prev[org.organizationId],
                        }))
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {bandOrganizations?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No band organizations found yet.</p>
            ) : null}
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
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Hourly Rate</th>
                    <th className="px-3 py-2 font-medium">Default Org</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                    <th className="px-3 py-2 font-medium">Options</th>
                  </tr>
                </thead>
                <tbody>
                  {(users ?? []).map((user) => (
                    <UserAdminRow
                      key={user.id}
                      user={user}
                      orgOptions={orgOptions}
                      resolvedOrgId={resolvedOrgId}
                      expanded={Boolean(expandedUserIds[user.id])}
                      onToggleExpanded={() =>
                        setExpandedUserIds((prev) => ({ ...prev, [user.id]: !prev[user.id] }))
                      }
                      onPasswordReset={() => void onUserPasswordReset(user)}
                      onMessage={setMessage}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {users === undefined ? <p className="text-sm text-muted-foreground">Loading users...</p> : null}
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
              <div className="min-w-[220px] flex-1 space-y-1">
                <Label>Organization</Label>
                <Select value={resolvedOrgId} onValueChange={setSelectedOrganizationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgOptions.map((org) => (
                      <SelectItem key={`invite-org-${org.id}`} value={org.id}>
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
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Organization</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(invitations ?? []).map((invite) => (
                    <tr key={invite.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2">{invite.email}</td>
                      <td className="px-3 py-2">{invite.organizationName}</td>
                      <td className="px-3 py-2">{invite.role}</td>
                      <td className="px-3 py-2">{invite.status}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {invite.status === "pending" ? (
                            <>
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
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invitations?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invites for this organization yet.</p>
            ) : null}
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
            setMessage("Invite sent.");
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
            setMessage("Invitation updated.");
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
            setMessage("User created.");
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

function UserAdminRow({
  user,
  orgOptions,
  resolvedOrgId,
  expanded,
  onToggleExpanded,
  onPasswordReset,
  onMessage,
}: {
  user: AdminUser;
  orgOptions: OrgOption[];
  resolvedOrgId: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onPasswordReset: () => void;
  onMessage: (message: string) => void;
}) {
  const updateUser = useMutation(api.users.updateUserAdmin);
  const addMembership = useMutation(api.users.addUserOrganizationMembershipAdmin);
  const removeMembership = useMutation(api.users.removeUserOrganizationMembershipAdmin);
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
    form.reset(userValuesFromRow(user, resolvedOrgId));
    form.suppressNextAutoSave();
  }, [user, resolvedOrgId, form]);

  const persist = async (values: UserAdminRowFormValues) => {
    await updateUser({
      userId: user.id,
      role: values.role,
      active: values.active,
      showOnPublicCrewPage: values.showOnPublicCrewPage,
      title: values.title || undefined,
      phone: values.phone || undefined,
      teams: values.teams,
      defaultOrganizationId: values.defaultOrganizationId || undefined,
      hourlyRateUsd: Number(values.hourlyRateUsd || "0"),
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

  const watched = form.watch();
  useEffect(() => {
    form.debouncedAutoSave(persist, { delayMs: 800, enabled: form.formState.isDirty });
  }, [watched, form]);

  async function onAddMembership() {
    if (!membershipDraft.organizationId) {
      window.alert("Select an organization to add.");
      return;
    }
    const alreadyExists = user.organizationMemberships.some(
      (membership) => membership.organizationId === membershipDraft.organizationId,
    );
    if (alreadyExists) {
      window.alert("User already has membership in this organization.");
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
      onMessage(getConvexErrorMessage(error));
    }
  }

  async function onRemoveMembership(organizationId: string) {
    const defaultOrg = form.getValues("defaultOrganizationId");
    if (defaultOrg === organizationId) {
      window.alert("Change default organization before removing this membership.");
      return;
    }
    try {
      await removeMembership({ userId: user.id, organizationId });
      onMessage(`Removed membership for ${user.name}.`);
    } catch (error) {
      onMessage(getConvexErrorMessage(error));
    }
  }

  return (
    <>
      <tr className="border-b align-top">
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
          <Input
            value={form.watch("title")}
            onChange={(e) => form.setValue("title", e.target.value, { shouldDirty: true })}
          />
        </td>
        <td className="px-3 py-2">
          <Input
            value={form.watch("phone")}
            onChange={(e) => form.setValue("phone", e.target.value, { shouldDirty: true })}
          />
        </td>
        <td className="px-3 py-2">
          <Input
            value={form.watch("hourlyRateUsd")}
            onChange={(e) => form.setValue("hourlyRateUsd", e.target.value, { shouldDirty: true })}
          />
        </td>
        <td className="px-3 py-2">
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
        </td>
        <td className="px-3 py-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.watch("active")}
              onChange={(e) => form.setValue("active", e.target.checked, { shouldDirty: true })}
            />
            Active
          </label>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <Select
              value=""
              onValueChange={(action) => {
                if (action === "reset") onPasswordReset();
                if (action === "toggle_details") onToggleExpanded();
              }}
            >
              <SelectTrigger className="min-w-[140px]">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reset">Reset Password</SelectItem>
                <SelectItem value="toggle_details">{expanded ? "Hide details" : "Show details"}</SelectItem>
              </SelectContent>
            </Select>
            <SaveStatusIcon saveStatus={form.saveStatus} saveError={form.saveError} />
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b bg-muted/20">
          <td className="px-3 py-2 text-xs text-muted-foreground">Advanced fields</td>
          <td className="px-3 py-2" colSpan={8}>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-md border p-2">
                <p className="mb-2 text-xs font-medium">Teams</p>
                <div className="grid gap-1 md:grid-cols-2">
                  {ADMIN_TEAM_OPTIONS.map((team) => (
                    <label key={`user-${user.id}-${team}`} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={form.watch("teams").includes(team)}
                        onChange={() =>
                          form.setValue("teams", toggleTeam(form.getValues("teams"), team), {
                            shouldDirty: true,
                          })
                        }
                      />
                      {team}
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-md border p-2">
                <p className="mb-2 text-xs font-medium">Public profile</p>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={form.watch("showOnPublicCrewPage")}
                    onChange={(e) =>
                      form.setValue("showOnPublicCrewPage", e.target.checked, { shouldDirty: true })
                    }
                  />
                  Show on public crew page
                </label>
              </div>
              <div className="rounded-md border p-2">
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
  expanded,
  onToggleExpanded,
}: {
  org: BandOrgRow;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const updateBandOrganizationProfileAdmin = useMutation(api.users.updateBandOrganizationProfileAdmin);

  const form = useConvexForm<BandOrgProfileFormValues>({
    schema: bandOrgProfileSchema,
    defaultValues: bandOrgValuesFromRow(org),
    mode: "onChange",
  });

  useEffect(() => {
    form.reset(bandOrgValuesFromRow(org));
    form.suppressNextAutoSave();
  }, [org, form]);

  const persist = async (values: BandOrgProfileFormValues) => {
    await updateBandOrganizationProfileAdmin({
      organizationId: org.organizationId,
      displayName: values.displayName || undefined,
      bio: values.bio || undefined,
      performerHourlyRateUsd: Number(values.performerHourlyRateUsd || "0"),
      publicWebsiteUrl: values.publicWebsiteUrl || undefined,
      publicInstagramUrl: values.publicInstagramUrl || undefined,
      publicYoutubeUrl: values.publicYoutubeUrl || undefined,
      publicListing: values.publicListing,
      publicSlug: values.publicSlug || undefined,
      publicHeroImageUrl: values.publicHeroImageUrl || undefined,
    });
  };

  const watched = form.watch();
  useEffect(() => {
    form.debouncedAutoSave(persist, { delayMs: 800, enabled: form.formState.isDirty });
  }, [watched, form]);

  return (
    <>
      <tr className="border-b align-top">
        <td className="px-3 py-2">
          <p className="font-medium">{org.name}</p>
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
          <div className="flex items-center gap-2">
            <Select
              value=""
              onValueChange={(action) => {
                if (action === "toggle_details") onToggleExpanded();
              }}
            >
              <SelectTrigger className="min-w-[140px]">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="toggle_details">{expanded ? "Hide details" : "Show details"}</SelectItem>
              </SelectContent>
            </Select>
            <SaveStatusIcon saveStatus={form.saveStatus} saveError={form.saveError} />
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b bg-muted/20">
          <td className="px-3 py-2 text-xs text-muted-foreground">Advanced fields</td>
          <td className="px-3 py-2" colSpan={3}>
            <div className="grid gap-2 md:grid-cols-3">
              <Input
                placeholder="Website URL"
                value={form.watch("publicWebsiteUrl")}
                onChange={(e) => form.setValue("publicWebsiteUrl", e.target.value, { shouldDirty: true })}
              />
              <Input
                placeholder="Instagram URL"
                value={form.watch("publicInstagramUrl")}
                onChange={(e) => form.setValue("publicInstagramUrl", e.target.value, { shouldDirty: true })}
              />
              <Input
                placeholder="YouTube URL"
                value={form.watch("publicYoutubeUrl")}
                onChange={(e) => form.setValue("publicYoutubeUrl", e.target.value, { shouldDirty: true })}
              />
            </div>
            <textarea
              className="mt-2 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={form.watch("bio")}
              onChange={(e) => form.setValue("bio", e.target.value, { shouldDirty: true })}
            />
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.watch("publicListing")}
                  onChange={(e) =>
                    form.setValue("publicListing", e.target.checked, { shouldDirty: true })
                  }
                />
                List on public artists page
              </label>
              <Input
                placeholder="Public slug (e.g. my-band)"
                value={form.watch("publicSlug")}
                onChange={(e) => form.setValue("publicSlug", e.target.value, { shouldDirty: true })}
              />
              <Input
                placeholder="Hero image URL"
                value={form.watch("publicHeroImageUrl")}
                onChange={(e) =>
                  form.setValue("publicHeroImageUrl", e.target.value, { shouldDirty: true })
                }
                className="md:col-span-2"
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
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
    defaultValues: { email: "", role: "member", teams: [] },
    mode: "onTouched",
  });

  const onSubmit = form.submitMutation(async (values) => {
    if (!orgId) throw new Error("Create or select an organization first.");
    await inviteUser({
      organizationId: orgId,
      email: values.email.trim(),
      role: values.role,
      teams: values.teams,
    });
    form.reset({ email: "", role: "member", teams: [] });
    onInvited();
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 pb-24">
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
              <div className="flex flex-wrap gap-3">
                {ADMIN_TEAM_OPTIONS.map((team) => (
                  <label key={`invite-${team}`} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.watch("teams").includes(team)}
                      onChange={() =>
                        form.setValue("teams", toggleTeam(form.getValues("teams"), team), {
                          shouldDirty: true,
                        })
                      }
                    />
                    {team}
                  </label>
                ))}
              </div>
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
          form.reset({ email: "", role: "member", teams: [] });
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
    defaultValues: { role: invite.role, teams: invite.teams },
    mode: "onTouched",
  });

  useEffect(() => {
    form.reset({ role: invite.role, teams: invite.teams });
    form.suppressNextAutoSave();
  }, [invite, form]);

  const onSubmit = form.submitMutation(async (values) => {
    await updateInvite({
      invitationId: invite.id,
      role: values.role,
      teams: isArborOrg(orgOptions, invite.organizationId) ? values.teams : undefined,
    });
    onSaved();
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 pb-24">
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
                <div className="flex flex-wrap gap-3">
                  {ADMIN_TEAM_OPTIONS.map((team) => (
                    <label key={`edit-invite-${team}`} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.watch("teams").includes(team)}
                        onChange={() =>
                          form.setValue("teams", toggleTeam(form.getValues("teams"), team), {
                            shouldDirty: true,
                          })
                        }
                      />
                      {team}
                    </label>
                  ))}
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
          form.reset({ role: invite.role, teams: invite.teams });
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
      teams: [],
      hourlyRateUsd: "0",
    },
    mode: "onTouched",
  });

  const onSubmit = form.submitMutation(async (values) => {
    if (!orgId) throw new Error("Create or select an organization first.");
    await createUser({
      organizationId: orgId,
      name: values.name.trim(),
      title: values.title.trim() || undefined,
      email: values.email.trim(),
      tempPassword: values.password,
      role: values.role,
      teams: values.teams,
      hourlyRateUsd: Number(values.hourlyRateUsd || "0"),
    });
    form.reset({
      name: "",
      title: "",
      email: "",
      password: "",
      role: "member",
      teams: [],
      hourlyRateUsd: "0",
    });
    onCreated();
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 pb-24">
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
                <TextFormField name="hourlyRateUsd" label="Hourly rate (USD)" />
              </div>
              <div className="flex flex-wrap gap-3">
                {ADMIN_TEAM_OPTIONS.map((team) => (
                  <label key={`create-${team}`} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.watch("teams").includes(team)}
                      onChange={() =>
                        form.setValue("teams", toggleTeam(form.getValues("teams"), team), {
                          shouldDirty: true,
                        })
                      }
                    />
                    {team}
                  </label>
                ))}
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
            teams: [],
            hourlyRateUsd: "0",
          });
          onClose();
        }}
        onRetry={() => void form.handleSubmit(onSubmit)()}
      />
    </div>
  );
}

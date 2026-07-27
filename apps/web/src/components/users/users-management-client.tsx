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
import { BandHeroUploadField } from "@/components/files/file-upload-field";
import { useConvexForm } from "@/hooks/use-convex-form";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  BAND_PAYEE_1099_NOTICE,
  BAND_PAYEE_MAILING_ADDRESS_HINT,
  BAND_PAYEE_MAILING_ADDRESS_PLACEHOLDER,
  DEFAULT_BAND_PAYEE_PAYOUT_METHOD,
  type BandPayeePayoutMethod,
} from "@/lib/band-payout-copy";
import { BandPayeePayoutMethodField } from "@/components/bands/band-payee-payout-method-field";
import {
  CREW_RATE_MODE_OPTIONS,
  PAYROLL_METHOD_OPTIONS,
  USER_DISCIPLINE_OPTIONS,
  USER_VERTICAL_OPTIONS,
  bandOrgProfileSchema,
  createUserAdminSchema,
  editInviteSchema,
  inviteUserSchema,
  userAdminRowSchema,
  type UserDisciplineOption,
  type UserVerticalOption,
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
  verticals: UserVerticalOption[];
  disciplines: UserDisciplineOption[];
};

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

function bandOrgValuesFromRow(org: BandOrgRow): BandOrgProfileFormValues {
  return {
    displayName: org.displayName ?? "",
    bio: org.bio ?? "",
    performerHourlyRateUsd: String(org.performerHourlyRateUsd ?? 0),
    designatedPayeeUserId: org.designatedPayeeUserId ?? "",
    designatedPayeeName: org.designatedPayeeName ?? "",
    designatedPayeeEmail: org.designatedPayeeEmail ?? "",
    designatedPayeeMailingAddress: org.designatedPayeeMailingAddress ?? "",
    designatedPayeePayoutMethod:
      org.designatedPayeePayoutMethod === "pickup" || org.designatedPayeePayoutMethod === "delivery"
        ? org.designatedPayeePayoutMethod
        : DEFAULT_BAND_PAYEE_PAYOUT_METHOD,
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
  const crewOnboarding = useQuery(api.onboarding.listCrewOnboardingForAdmin, {});
  const waiveOnboarding = useMutation(api.onboarding.waiveCrewOnboarding);
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
  const setUserAccess = useMutation(api.users.setUserAccessAdmin);
  const backfillDefaults = useMutation(api.users.backfillUserAdminDefaults);

  const [organizationName, setOrganizationName] = useState("");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editingInvite, setEditingInvite] = useState<EditingInvite | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedUserIds, setExpandedUserIds] = useState<Record<string, boolean>>({});
  const [expandedBandOrgIds, setExpandedBandOrgIds] = useState<Record<string, boolean>>({});
  const [onboardingFilter, setOnboardingFilter] = useState<"all" | "incomplete">("all");
  const [accessFilter, setAccessFilter] = useState<"active" | "removed" | "all">("active");
  const showOrganizations = view === "all" || view === "organizations";
  const showAccess = view === "all" || view === "access";
  const showRates = view === "all";

  const orgOptions = useMemo(() => organizations ?? [], [organizations]);
  const resolvedOrgId = selectedOrganizationId || orgOptions[0]?.id || "";
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
      verticals: (invite.verticals ?? []) as UserVerticalOption[],
      disciplines: (invite.disciplines ?? []) as UserDisciplineOption[],
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

  async function onSetUserAccess(user: AdminUser, removed: boolean) {
    const action = removed ? "Remove access for" : "Reactivate";
    if (!window.confirm(`${action} ${user.name}?`)) return;
    try {
      await setUserAccess({ userId: user.id, removed });
      setMessage(removed ? `Removed access for ${user.name}.` : `Reactivated ${user.name}.`);
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
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Onboarding</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Hourly Rate</th>
                    <th className="px-3 py-2 font-medium">Default Org</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                    <th className="px-3 py-2 font-medium">Options</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <UserAdminRow
                      key={user.id}
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
                          setMessage(`Waived onboarding for ${user.name}.`);
                        } catch (error) {
                          setMessage(getConvexErrorMessage(error));
                        }
                      }}
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
      <tr className={`border-b align-top ${removed ? "text-muted-foreground" : ""}`}>
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
          <div className="space-y-1">
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
        <tr className="border-b bg-muted/20">
          <td className="px-3 py-2 text-xs text-muted-foreground">Advanced fields</td>
          <td className="px-3 py-2" colSpan={9}>
            <div className="grid gap-2 md:grid-cols-2">
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
    if (form.formState.isDirty) return;
    form.reset(bandOrgValuesFromRow(org));
  }, [org, form]);

  const persist = async (values: BandOrgProfileFormValues) => {
    const payoutMethod =
      values.designatedPayeePayoutMethod === "pickup" ||
      values.designatedPayeePayoutMethod === "delivery"
        ? values.designatedPayeePayoutMethod
        : DEFAULT_BAND_PAYEE_PAYOUT_METHOD;
    await updateBandOrganizationProfileAdmin({
      organizationId: org.organizationId,
      displayName: values.displayName || undefined,
      bio: values.bio || undefined,
      performerHourlyRateUsd: Number(values.performerHourlyRateUsd || "0"),
      designatedPayeeUserId: values.designatedPayeeUserId || undefined,
      designatedPayeeName: values.designatedPayeeName || undefined,
      designatedPayeeEmail: values.designatedPayeeEmail || undefined,
      designatedPayeeMailingAddress: values.designatedPayeeMailingAddress || undefined,
      designatedPayeePayoutMethod: payoutMethod,
      publicWebsiteUrl: values.publicWebsiteUrl || undefined,
      publicInstagramUrl: values.publicInstagramUrl || undefined,
      publicYoutubeUrl: values.publicYoutubeUrl || undefined,
      publicListing: values.publicListing,
      publicSlug: values.publicSlug || undefined,
      publicHeroImageUrl: values.publicHeroImageUrl || undefined,
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

  const payoutMethod =
    form.watch("designatedPayeePayoutMethod") === "delivery"
      ? "delivery"
      : form.watch("designatedPayeePayoutMethod") === "pickup"
        ? "pickup"
        : DEFAULT_BAND_PAYEE_PAYOUT_METHOD;

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
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Payment payee</p>
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  placeholder="Payee name"
                  value={form.watch("designatedPayeeName")}
                  onChange={(e) =>
                    form.setValue("designatedPayeeName", e.target.value, { shouldDirty: true })
                  }
                />
                <Input
                  placeholder="Payee email"
                  value={form.watch("designatedPayeeEmail")}
                  onChange={(e) =>
                    form.setValue("designatedPayeeEmail", e.target.value, { shouldDirty: true })
                  }
                />
              </div>
              <BandPayeePayoutMethodField
                value={payoutMethod}
                onChange={(method: BandPayeePayoutMethod) => {
                  form.setValue("designatedPayeePayoutMethod", method, { shouldDirty: true });
                }}
                idPrefix={`admin-band-${org.organizationId}`}
              />
              <textarea
                className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder={BAND_PAYEE_MAILING_ADDRESS_PLACEHOLDER}
                value={form.watch("designatedPayeeMailingAddress")}
                onChange={(e) =>
                  form.setValue("designatedPayeeMailingAddress", e.target.value, {
                    shouldDirty: true,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">{BAND_PAYEE_MAILING_ADDRESS_HINT}</p>
              <p className="text-xs text-muted-foreground">{BAND_PAYEE_1099_NOTICE}</p>
            </div>
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
              <div className="md:col-span-2">
                <BandHeroUploadField
                  organizationId={org.organizationId}
                  currentUrl={form.watch("publicHeroImageUrl")}
                  urlValue={form.watch("publicHeroImageUrl")}
                  onUploaded={(url) => form.setValue("publicHeroImageUrl", url, { shouldDirty: true })}
                  onUrlChange={(url) => form.setValue("publicHeroImageUrl", url, { shouldDirty: true })}
                  onClear={() => form.setValue("publicHeroImageUrl", "", { shouldDirty: true })}
                />
              </div>
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

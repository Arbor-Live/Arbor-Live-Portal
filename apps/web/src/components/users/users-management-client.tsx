"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserRatesAdminClient } from "@/components/users/user-rates-admin-client";

const TEAM_OPTIONS = ["Sound", "Lights", "Design", "Marketing", "Operations"] as const;
type TeamOption = (typeof TEAM_OPTIONS)[number];

type UserDraft = {
  role: string;
  active: boolean;
  title: string;
  phone: string;
  hourlyRateUsd: string;
  teams: TeamOption[];
  defaultOrganizationId: string;
};

type MembershipDraft = {
  organizationId: string;
  role: string;
};
const NO_DEFAULT_ORG = "__none__";

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
  const updateBandOrganizationProfileAdmin = useMutation(api.users.updateBandOrganizationProfileAdmin);
  const inviteUser = useMutation(api.users.inviteUserAdmin);
  const resendInvite = useMutation(api.users.resendInviteAdmin);
  const createUser = useMutation(api.users.createUserAdmin);
  const updateUser = useMutation(api.users.updateUserAdmin);
  const addMembership = useMutation(api.users.addUserOrganizationMembershipAdmin);
  const removeMembership = useMutation(api.users.removeUserOrganizationMembershipAdmin);
  const sendPasswordReset = useMutation(api.users.sendPasswordResetAdmin);
  const backfillDefaults = useMutation(api.users.backfillUserAdminDefaults);

  const [organizationName, setOrganizationName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteTeams, setInviteTeams] = useState<TeamOption[]>([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("member");
  const [createTeams, setCreateTeams] = useState<TeamOption[]>([]);
  const [createRate, setCreateRate] = useState("0");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [membershipDrafts, setMembershipDrafts] = useState<Record<string, MembershipDraft>>({});
  const [bandOrgDrafts, setBandOrgDrafts] = useState<
    Record<string, { displayName: string; bio: string; performerHourlyRateUsd: string; publicWebsiteUrl: string; publicInstagramUrl: string; publicYoutubeUrl: string }>
  >({});
  const [expandedUserIds, setExpandedUserIds] = useState<Record<string, boolean>>({});
  const [expandedBandOrgIds, setExpandedBandOrgIds] = useState<Record<string, boolean>>({});
  const showOrganizations = view === "all" || view === "organizations";
  const showAccess = view === "all" || view === "access";
  const showRates = view === "all";

  const orgOptions = useMemo(() => organizations ?? [], [organizations]);
  const resolvedOrgId = selectedOrganizationId || orgOptions[0]?.id || "";

  function isArborOrg(orgId: string) {
    const org = orgOptions.find((entry) => entry.id === orgId);
    if (!org) return false;
    const name = org.name.trim().toLowerCase();
    const slug = (org.slug ?? "").trim().toLowerCase();
    return name === "arbor live" || slug === "arbor-live";
  }

  function getRoleOptionsForOrg(orgId: string) {
    if (isArborOrg(orgId)) {
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

  function toggleTeam(teams: TeamOption[], team: TeamOption) {
    return teams.includes(team) ? teams.filter((entry) => entry !== team) : [...teams, team];
  }

  function draftFor(user: NonNullable<typeof users>[number]): UserDraft {
    const existing = drafts[user.id];
    if (existing) return existing;
    return {
      role: user.role || "member",
      active: user.active,
      title: user.title || "",
      phone: user.phone || "",
      hourlyRateUsd: (user.hourlyRateUsd ?? 0).toString(),
      teams: (user.teams ?? []) as TeamOption[],
      defaultOrganizationId: user.defaultOrganizationId || resolvedOrgId,
    };
  }

  function membershipDraftFor(user: NonNullable<typeof users>[number]): MembershipDraft {
    const existing = membershipDrafts[user.id];
    if (existing) return existing;
    return {
      organizationId: "",
      role: "org_member",
    };
  }

  async function onCreateOrganization() {
    if (!organizationName.trim()) return;
    const created = await createOrganization({ name: organizationName.trim() });
    setOrganizationName("");
    setSelectedOrganizationId(created.id);
    setMessage(`Created organization ${created.name}.`);
  }

  async function onInviteUser() {
    if (!resolvedOrgId) {
      window.alert("Create or select an organization first.");
      return;
    }
    await inviteUser({
      organizationId: resolvedOrgId,
      email: inviteEmail.trim(),
      role: inviteRole,
      teams: inviteTeams,
    });
    setInviteEmail("");
    setInviteTeams([]);
    setInviteModalOpen(false);
    setMessage("Invite sent.");
  }

  async function onCreateUser() {
    if (!resolvedOrgId) {
      window.alert("Create or select an organization first.");
      return;
    }
    await createUser({
      organizationId: resolvedOrgId,
      name: createName.trim(),
      title: createTitle.trim() || undefined,
      email: createEmail.trim(),
      tempPassword: createPassword,
      role: createRole,
      teams: createTeams,
      hourlyRateUsd: Number(createRate || "0"),
    });
    setCreateName("");
    setCreateTitle("");
    setCreateEmail("");
    setCreatePassword("");
    setCreateTeams([]);
    setCreateRate("0");
    setCreateModalOpen(false);
    setMessage("User created.");
  }

  async function onSaveUser(user: NonNullable<typeof users>[number]) {
    const draft = draftFor(user);
    await updateUser({
      userId: user.id,
      role: draft.role,
      active: draft.active,
      title: draft.title || undefined,
      phone: draft.phone || undefined,
      teams: draft.teams,
      defaultOrganizationId: draft.defaultOrganizationId || undefined,
      hourlyRateUsd: Number(draft.hourlyRateUsd || "0"),
      organizationMemberships: draft.defaultOrganizationId
        ? [
            {
              organizationId: draft.defaultOrganizationId,
              role: draft.role,
              active: draft.active,
            },
          ]
        : undefined,
    });
    setMessage(`Saved ${user.name}.`);
  }

  async function onAddMembership(user: NonNullable<typeof users>[number]) {
    const draft = membershipDraftFor(user);
    if (!draft.organizationId) {
      window.alert("Select an organization to add.");
      return;
    }
    const alreadyExists = user.organizationMemberships.some(
      (membership) => membership.organizationId === draft.organizationId,
    );
    if (alreadyExists) {
      window.alert("User already has membership in this organization.");
      return;
    }
    await addMembership({
      userId: user.id,
      organizationId: draft.organizationId,
      role: draft.role,
      active: true,
    });
    setMembershipDrafts((prev) => ({
      ...prev,
      [user.id]: { organizationId: "", role: "org_member" },
    }));
    setMessage(`Added membership for ${user.name}.`);
  }

  async function onRemoveMembership(
    user: NonNullable<typeof users>[number],
    organizationId: string,
  ) {
    const draft = draftFor(user);
    if (draft.defaultOrganizationId === organizationId) {
      window.alert("Change default organization before removing this membership.");
      return;
    }
    await removeMembership({
      userId: user.id,
      organizationId,
    });
    setMessage(`Removed membership for ${user.name}.`);
  }

  async function onSaveBandOrg(org: NonNullable<typeof bandOrganizations>[number]) {
    const draft = bandOrgDrafts[org.organizationId] ?? {
      displayName: org.displayName ?? "",
      bio: org.bio ?? "",
      performerHourlyRateUsd: String(org.performerHourlyRateUsd ?? 0),
      publicWebsiteUrl: org.publicWebsiteUrl ?? "",
      publicInstagramUrl: org.publicInstagramUrl ?? "",
      publicYoutubeUrl: org.publicYoutubeUrl ?? "",
    };
    await updateBandOrganizationProfileAdmin({
      organizationId: org.organizationId,
      displayName: draft.displayName || undefined,
      bio: draft.bio || undefined,
      performerHourlyRateUsd: Number(draft.performerHourlyRateUsd || "0"),
      publicWebsiteUrl: draft.publicWebsiteUrl || undefined,
      publicInstagramUrl: draft.publicInstagramUrl || undefined,
      publicYoutubeUrl: draft.publicYoutubeUrl || undefined,
    });
    setMessage(`Updated band org profile for ${org.name}.`);
  }

  function toggleUserExpanded(userId: string) {
    setExpandedUserIds((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }

  function toggleBandOrgExpanded(organizationId: string) {
    setExpandedBandOrgIds((prev) => ({ ...prev, [organizationId]: !prev[organizationId] }));
  }

  async function onUserAction(user: NonNullable<typeof users>[number], action: string) {
    if (action === "save") {
      await onSaveUser(user);
      return;
    }
    if (action === "reset") {
      await sendPasswordReset({ userId: user.id });
      setMessage(`Password reset sent for ${user.name}.`);
      return;
    }
    if (action === "toggle_details") {
      toggleUserExpanded(user.id);
    }
  }

  async function onBandOrgAction(org: NonNullable<typeof bandOrganizations>[number], action: string) {
    if (action === "save") {
      await onSaveBandOrg(org);
      return;
    }
    if (action === "toggle_details") {
      toggleBandOrgExpanded(org.organizationId);
    }
  }

  return (
    <div className="space-y-4">
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
                {(bandOrganizations ?? []).map((org) => {
                  const draft = bandOrgDrafts[org.organizationId] ?? {
                    displayName: org.displayName ?? "",
                    bio: org.bio ?? "",
                    performerHourlyRateUsd: String(org.performerHourlyRateUsd ?? 0),
                    publicWebsiteUrl: org.publicWebsiteUrl ?? "",
                    publicInstagramUrl: org.publicInstagramUrl ?? "",
                    publicYoutubeUrl: org.publicYoutubeUrl ?? "",
                  };
                  return (
                    <>
                      <tr key={org.organizationId} className="border-b align-top">
                        <td className="px-3 py-2">
                          <p className="font-medium">{org.name}</p>
                          <p className="text-xs text-muted-foreground">/{org.slug}</p>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={draft.displayName}
                            onChange={(e) =>
                              setBandOrgDrafts((prev) => ({
                                ...prev,
                                [org.organizationId]: { ...draft, displayName: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            inputMode="decimal"
                            value={draft.performerHourlyRateUsd}
                            onChange={(e) =>
                              setBandOrgDrafts((prev) => ({
                                ...prev,
                                [org.organizationId]: { ...draft, performerHourlyRateUsd: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value=""
                            onValueChange={(action) => {
                              void onBandOrgAction(org, action);
                            }}
                          >
                            <SelectTrigger className="min-w-[140px]">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="save">Save</SelectItem>
                              <SelectItem value="toggle_details">
                                {expandedBandOrgIds[org.organizationId] ? "Hide details" : "Show details"}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                      {expandedBandOrgIds[org.organizationId] ? (
                        <tr className="border-b bg-muted/20">
                          <td className="px-3 py-2 text-xs text-muted-foreground">Advanced fields</td>
                          <td className="px-3 py-2" colSpan={3}>
                            <div className="grid gap-2 md:grid-cols-3">
                              <Input
                                placeholder="Website URL"
                                value={draft.publicWebsiteUrl}
                                onChange={(e) =>
                                  setBandOrgDrafts((prev) => ({
                                    ...prev,
                                    [org.organizationId]: { ...draft, publicWebsiteUrl: e.target.value },
                                  }))
                                }
                              />
                              <Input
                                placeholder="Instagram URL"
                                value={draft.publicInstagramUrl}
                                onChange={(e) =>
                                  setBandOrgDrafts((prev) => ({
                                    ...prev,
                                    [org.organizationId]: { ...draft, publicInstagramUrl: e.target.value },
                                  }))
                                }
                              />
                              <Input
                                placeholder="YouTube URL"
                                value={draft.publicYoutubeUrl}
                                onChange={(e) =>
                                  setBandOrgDrafts((prev) => ({
                                    ...prev,
                                    [org.organizationId]: { ...draft, publicYoutubeUrl: e.target.value },
                                  }))
                                }
                              />
                            </div>
                            <textarea
                              className="mt-2 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                              value={draft.bio}
                              onChange={(e) =>
                                setBandOrgDrafts((prev) => ({
                                  ...prev,
                                  [org.organizationId]: { ...draft, bio: e.target.value },
                                }))
                              }
                            />
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
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
                {(orgOptions ?? []).map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" onClick={() => void backfillDefaults({})}>
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
                {(users ?? []).map((user) => {
                  const draft = draftFor(user);
                  return (
                    <>
                      <tr key={user.id} className="border-b align-top">
                        <td className="px-3 py-2">{user.name}</td>
                        <td className="px-3 py-2">{user.email}</td>
                        <td className="px-3 py-2">
                          <Select
                            value={draft.role}
                            onValueChange={(value) =>
                              setDrafts((prev) => ({ ...prev, [user.id]: { ...draft, role: value } }))
                            }
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
                            value={draft.title}
                            onChange={(e) =>
                              setDrafts((prev) => ({ ...prev, [user.id]: { ...draft, title: e.target.value } }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={draft.phone}
                            onChange={(e) =>
                              setDrafts((prev) => ({ ...prev, [user.id]: { ...draft, phone: e.target.value } }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={draft.hourlyRateUsd}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [user.id]: { ...draft, hourlyRateUsd: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={draft.defaultOrganizationId || NO_DEFAULT_ORG}
                            onValueChange={(value) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [user.id]: {
                                  ...draft,
                                  defaultOrganizationId: value === NO_DEFAULT_ORG ? "" : value,
                                },
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_DEFAULT_ORG}>No default org</SelectItem>
                              {(orgOptions ?? []).map((org) => (
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
                              checked={draft.active}
                              onChange={(e) =>
                                setDrafts((prev) => ({ ...prev, [user.id]: { ...draft, active: e.target.checked } }))
                              }
                            />
                            Active
                          </label>
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value=""
                            onValueChange={(action) => {
                              void onUserAction(user, action);
                            }}
                          >
                            <SelectTrigger className="min-w-[140px]">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="save">Save</SelectItem>
                              <SelectItem value="reset">Reset Password</SelectItem>
                              <SelectItem value="toggle_details">
                                {expandedUserIds[user.id] ? "Hide details" : "Show details"}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                      {expandedUserIds[user.id] ? (
                        <tr className="border-b bg-muted/20">
                          <td className="px-3 py-2 text-xs text-muted-foreground">Advanced fields</td>
                          <td className="px-3 py-2" colSpan={8}>
                            <div className="grid gap-2 md:grid-cols-2">
                              <div className="rounded-md border p-2">
                                <p className="mb-2 text-xs font-medium">Teams</p>
                                <div className="grid gap-1 md:grid-cols-2">
                                  {TEAM_OPTIONS.map((team) => (
                                    <label key={`user-${user.id}-${team}`} className="flex items-center gap-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={draft.teams.includes(team)}
                                        onChange={() =>
                                          setDrafts((prev) => ({
                                            ...prev,
                                            [user.id]: { ...draft, teams: toggleTeam(draft.teams, team) },
                                          }))
                                        }
                                      />
                                      {team}
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="rounded-md border p-2">
                                <p className="mb-2 text-xs font-medium">Organization Memberships</p>
                                <div className="space-y-1 text-xs text-muted-foreground">
                                  {user.organizationMemberships.map((membership) => (
                                    <div key={`${user.id}-${membership.organizationId}`} className="flex items-center gap-1">
                                      <span>{membership.organizationName} ({membership.role})</span>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void onRemoveMembership(user, membership.organizationId)}
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-2 grid gap-1">
                                  <Select
                                    value={membershipDraftFor(user).organizationId || NO_DEFAULT_ORG}
                                    onValueChange={(value) => {
                                      const nextOrgId = value === NO_DEFAULT_ORG ? "" : value;
                                      const roleOptions = getRoleOptionsForOrg(nextOrgId);
                                      setMembershipDrafts((prev) => ({
                                        ...prev,
                                        [user.id]: {
                                          organizationId: nextOrgId,
                                          role: roleOptions[0]?.value ?? "org_member",
                                        },
                                      }));
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Add membership org..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={NO_DEFAULT_ORG}>Add membership org...</SelectItem>
                                      {(orgOptions ?? []).map((org) => (
                                        <SelectItem key={`membership-org-${user.id}-${org.id}`} value={org.id}>
                                          {org.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={membershipDraftFor(user).role}
                                    onValueChange={(value) =>
                                      setMembershipDrafts((prev) => ({
                                        ...prev,
                                        [user.id]: {
                                          ...membershipDraftFor(user),
                                          role: value,
                                        },
                                      }))
                                    }
                                    disabled={!membershipDraftFor(user).organizationId}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getRoleOptionsForOrg(membershipDraftFor(user).organizationId).map((option) => (
                                        <SelectItem key={`${user.id}-role-${option.value}`} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button type="button" variant="outline" size="sm" onClick={() => void onAddMembership(user)}>
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
                })}
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
                  {(orgOptions ?? []).map((org) => (
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
                      <Button type="button" variant="outline" size="sm" onClick={() => void resendInvite({ invitationId: invite.id })}>
                        Resend
                      </Button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Invite User</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  placeholder="Email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getRoleOptionsForOrg(resolvedOrgId).map((option) => (
                      <SelectItem key={`invite-role-${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-3">
                {TEAM_OPTIONS.map((team) => (
                  <label key={`invite-${team}`} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={inviteTeams.includes(team)}
                      onChange={() => setInviteTeams((prev) => toggleTeam(prev, team))}
                    />
                    {team}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={() => void onInviteUser()}>
                  Send Invite
                </Button>
                <Button type="button" variant="outline" onClick={() => setInviteModalOpen(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {showAccess && createModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>Create User (Direct)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <Input placeholder="Name" value={createName} onChange={(e) => setCreateName(e.target.value)} />
                <Input placeholder="Title (optional)" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} />
                <Input placeholder="Email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
                <Input
                  placeholder="Temporary password"
                  value={createPassword}
                  type="password"
                  onChange={(e) => setCreatePassword(e.target.value)}
                />
                <Select value={createRole} onValueChange={setCreateRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getRoleOptionsForOrg(resolvedOrgId).map((option) => (
                      <SelectItem key={`create-role-${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Hourly rate (USD)"
                  value={createRate}
                  onChange={(e) => setCreateRate(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                {TEAM_OPTIONS.map((team) => (
                  <label key={`create-${team}`} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createTeams.includes(team)}
                      onChange={() => setCreateTeams((prev) => toggleTeam(prev, team))}
                    />
                    {team}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={() => void onCreateUser()}>
                  Create User
                </Button>
                <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

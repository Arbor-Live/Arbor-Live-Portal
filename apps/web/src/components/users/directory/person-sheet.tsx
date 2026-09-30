"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { XIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useConvexForm } from "@/hooks/use-convex-form";
import { StatusPillSelect } from "@/components/page-header";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  SheetSection,
  USER_STATUS_OPTIONS,
  VerticalsAndDisciplines,
  getRoleOptionsForOrg,
  isOnboardingIncomplete,
  pruneDisciplinesForVerticals,
  roleLabel,
  type AdminUser,
  type CrewOnboardingRow,
  type OrgOption,
  type UserStatus,
} from "@/components/users/directory/shared";
import {
  userAdminRowSchema,
  type CrewRateModeOption,
  type PayrollMethodOption,
  type UserAdminRowFormValues,
  type UserDisciplineOption,
  type UserVerticalOption,
} from "@/lib/validations/users";

const NO_DEFAULT_ORG = "__none__";

const STATUS_CONFIRM: Record<
  UserStatus,
  (name: string) => { title: string; description: string; confirmLabel: string; destructive?: boolean }
> = {
  active: (name) => ({
    title: `Activate ${name}?`,
    description: "They will be counted for availability and get weekly emails again.",
    confirmLabel: "Activate",
  }),
  inactive: (name) => ({
    title: `Mark ${name} inactive?`,
    description:
      "They keep their account and can reactivate on sign-in, but they won't be counted for availability or get weekly emails.",
    confirmLabel: "Mark inactive",
  }),
  alumni: (name) => ({
    title: `Close access for ${name}?`,
    description:
      "They lose dashboard access and can only be brought back by an admin. They are hidden from all pickers.",
    confirmLabel: "Mark alumni",
    destructive: true,
  }),
};

const STATUS_DONE: Record<UserStatus, (name: string) => string> = {
  active: (name) => `Activated ${name}.`,
  inactive: (name) => `Marked ${name} inactive.`,
  alumni: (name) => `Marked ${name} as alumni.`,
};

/** Actions shared by a People row's `⋯` menu and the person panel. Each returns whether it succeeded. */
export function usePersonActions() {
  const { confirm } = useAppDialog();
  const setUserStatus = useMutation(api.users.setUserStatusAdmin);
  const sendPasswordReset = useMutation(api.users.sendPasswordResetAdmin);
  const waiveOnboarding = useMutation(api.onboarding.waiveCrewOnboarding);

  async function attempt(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      notify.success(message);
      return true;
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
      return false;
    }
  }

  return {
    async setStatus(user: AdminUser, status: UserStatus) {
      if (status === user.status) return false;
      if (!(await confirm(STATUS_CONFIRM[status](user.name)))) return false;
      return attempt(() => setUserStatus({ userId: user.id, status }), STATUS_DONE[status](user.name));
    },
    sendPasswordReset(user: AdminUser) {
      return attempt(() => sendPasswordReset({ userId: user.id }), `Password reset sent for ${user.name}.`);
    },
    waiveOnboarding(user: AdminUser) {
      return attempt(() => waiveOnboarding({ userId: user.id }), `Waived onboarding for ${user.name}.`);
    },
  };
}

function valuesFromUser(user: AdminUser): UserAdminRowFormValues {
  const verticals = (user.verticals ?? []) as UserVerticalOption[];
  return {
    // Better Auth defaults new accounts to "user"; the picker offers Member / Admin.
    role: user.role === "admin" ? "admin" : "member",
    name: user.name,
    username: user.username ?? "",
    requiresOnboarding: user.requiresOnboarding ?? true,
    includeInTimecards: user.includeInTimecards ?? true,
    assignableAsCrew: user.assignableAsCrew ?? true,
    emailOptOuts: [],
    showOnPublicCrewPage: user.showOnPublicCrewPage ?? false,
    publicCrewDescription: user.publicCrewDescription ?? "",
    title: user.title || "",
    phone: user.phone || "",
    rateMode: (user.rateMode ?? "custom") as UserAdminRowFormValues["rateMode"],
    hourlyRateUsd: (user.customHourlyRateUsd ?? user.hourlyRateUsd ?? 0).toString(),
    payrollMethod: (user.payrollMethod ?? "stanford") as UserAdminRowFormValues["payrollMethod"],
    verticals,
    disciplines: pruneDisciplinesForVerticals(
      verticals,
      (user.disciplines ?? []) as UserDisciplineOption[],
    ),
    defaultOrganizationId: user.defaultOrganizationId,
  };
}

export function PersonSheet({
  user,
  onboarding,
  orgOptions,
  onOpenChange,
}: {
  user: AdminUser | null;
  onboarding: CrewOnboardingRow | null;
  orgOptions: OrgOption[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={user !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="person-sheet">
        {user ? (
          // Keyed so drafts reset when another person opens.
          <PersonSheetBody key={user.id} user={user} onboarding={onboarding} orgOptions={orgOptions} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PersonSheetBody({
  user,
  onboarding,
  orgOptions,
}: {
  user: AdminUser;
  onboarding: CrewOnboardingRow | null;
  orgOptions: OrgOption[];
}) {
  const actions = usePersonActions();
  const { alert } = useAppDialog();
  const updateUser = useMutation(api.users.updateUserAdmin);
  const addMembership = useMutation(api.users.addUserOrganizationMembershipAdmin);
  const removeMembership = useMutation(api.users.removeUserOrganizationMembershipAdmin);
  const emailPreferences = useQuery(api.users.getUserEmailPreferences, { userId: user.id });
  const [membershipOrgId, setMembershipOrgId] = useState("");
  const [membershipRole, setMembershipRole] = useState("org_member");
  const [busy, setBusy] = useState(false);

  const form = useConvexForm<UserAdminRowFormValues>({
    schema: userAdminRowSchema,
    defaultValues: valuesFromUser(user),
    mode: "onChange",
  });
  const { isDirty } = form.formState;

  // Adopt server changes while the admin hasn't started editing.
  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset(valuesFromUser(user));
  }, [user, form]);

  useEffect(() => {
    if (!emailPreferences) return;
    if (form.formState.dirtyFields.emailOptOuts) return;
    form.setValue(
      "emailOptOuts",
      emailPreferences.filter((entry) => !entry.enabled).map((entry) => entry.template),
      { shouldDirty: false },
    );
  }, [emailPreferences, user, form]);

  const emailOptOuts = form.watch("emailOptOuts");
  const rateMode = form.watch("rateMode");

  const emailGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof emailPreferences>>();
    for (const entry of emailPreferences ?? []) {
      const list = groups.get(entry.group) ?? [];
      list.push(entry);
      groups.set(entry.group, list);
    }
    return [...groups];
  }, [emailPreferences]);

  const membershipOrgOptions = useMemo(() => {
    const existing = new Set(user.organizationMemberships.map((row) => row.organizationId));
    return orgOptions
      .filter((org) => !existing.has(org.id))
      .map((org) => ({ value: org.id, label: org.name }));
  }, [orgOptions, user.organizationMemberships]);

  function setEmailPreference(template: string, enabled: boolean) {
    const disabled = new Set(form.getValues("emailOptOuts"));
    if (enabled) disabled.delete(template);
    else disabled.add(template);
    form.setValue("emailOptOuts", [...disabled], { shouldDirty: true });
  }

  const onSave = form.submitMutation(
    async (values) => {
      // Leave a "user" role as-is unless the admin actually picks one.
      const role = form.formState.dirtyFields.role ? values.role : user.role || values.role;
      await updateUser({
        userId: user.id,
        role,
        name: values.name,
        username: values.username,
        requiresOnboarding: values.requiresOnboarding,
        includeInTimecards: values.includeInTimecards,
        assignableAsCrew: values.assignableAsCrew,
        // Only touch preferences we actually loaded (or the admin changed), so
        // a save can never wipe opt-outs the editor never displayed.
        ...(emailPreferences !== undefined || form.formState.dirtyFields.emailOptOuts
          ? { emailOptOuts: values.emailOptOuts }
          : {}),
        showOnPublicCrewPage: values.showOnPublicCrewPage,
        publicCrewDescription: values.publicCrewDescription || undefined,
        title: values.title || undefined,
        phone: values.phone || undefined,
        verticals: values.verticals,
        disciplines: values.disciplines,
        defaultOrganizationId: values.defaultOrganizationId || undefined,
        rateMode: values.rateMode,
        customHourlyRateUsd:
          values.rateMode === "custom" ? Number(values.hourlyRateUsd || "0") : undefined,
        payrollMethod: values.payrollMethod,
        organizationMemberships: values.defaultOrganizationId
          ? [{ organizationId: values.defaultOrganizationId, role }]
          : undefined,
      });
      return values;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
        notify.success(`Saved ${values.name}.`);
      },
    },
  );

  async function onAddMembership() {
    if (!membershipOrgId) {
      await alert("Select an organization to add.");
      return;
    }
    setBusy(true);
    try {
      await addMembership({
        userId: user.id,
        organizationId: membershipOrgId,
        role: membershipRole,
        active: true,
      });
      setMembershipOrgId("");
      setMembershipRole("org_member");
      notify.success(`Added membership for ${user.name}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveMembership(organizationId: string) {
    if (form.getValues("defaultOrganizationId") === organizationId) {
      await alert("Change default organization before removing this membership.");
      return;
    }
    setBusy(true);
    try {
      await removeMembership({ userId: user.id, organizationId });
      notify.success(`Removed membership for ${user.name}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const field = (id: string) => `person-${user.id}-${id}`;
  const participation = [
    { key: "requiresOnboarding", label: "Requires onboarding" },
    { key: "includeInTimecards", label: "Include in timecards" },
    { key: "assignableAsCrew", label: "Assignable as crew" },
  ] as const;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {user.name}
          <StatusPillSelect
            label="Access"
            value={user.status}
            options={USER_STATUS_OPTIONS}
            onChange={(status) => void actions.setStatus(user, status)}
          />
        </SheetTitle>
        <SheetDescription>
          {user.email} · {roleLabel(user.role)}
        </SheetDescription>
      </SheetHeader>

      <SheetSection title="Profile">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={field("name")}>Name</Label>
            <Input id={field("name")} {...form.register("name")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={field("username")}>Username</Label>
            <Input id={field("username")} placeholder="Mention handle" {...form.register("username")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={field("title")}>Title</Label>
            <Input id={field("title")} {...form.register("title")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={field("phone")}>Phone</Label>
            <Input id={field("phone")} type="tel" {...form.register("phone")} />
          </div>
        </div>
      </SheetSection>

      <SheetSection title="Access">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={field("role")}>Role</Label>
            <Select
              value={form.watch("role")}
              onValueChange={(value) => form.setValue("role", value, { shouldDirty: true })}
            >
              <SelectTrigger id={field("role")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={field("default-org")}>Default organization</Label>
            <Select
              value={form.watch("defaultOrganizationId") || NO_DEFAULT_ORG}
              onValueChange={(value) =>
                form.setValue("defaultOrganizationId", value === NO_DEFAULT_ORG ? "" : value, {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger id={field("default-org")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DEFAULT_ORG}>No default organization</SelectItem>
                {user.organizationMemberships.map((membership) => (
                  <SelectItem key={membership.organizationId} value={membership.organizationId}>
                    {membership.organizationName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Admin grants the whole dashboard. The role is also saved on the default organization&apos;s
          membership.
        </p>
      </SheetSection>

      <SheetSection title="Memberships" testId="person-memberships">
        {user.organizationMemberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not a member of any organization yet.</p>
        ) : (
          <ul className="divide-y border text-sm">
            {user.organizationMemberships.map((membership) => (
              <li
                key={membership.organizationId}
                data-testid="person-membership"
                className="flex items-center gap-2 py-1 pr-1 pl-3"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{membership.organizationName}</span>
                {membership.organizationId === user.defaultOrganizationId ? (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Default
                  </span>
                ) : null}
                {!membership.active ? (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Inactive
                  </span>
                ) : null}
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  {roleLabel(membership.role)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  aria-label={`Remove ${membership.organizationName} membership`}
                  title="Remove membership"
                  onClick={() => void onRemoveMembership(membership.organizationId)}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          <SearchableSelect
            value={membershipOrgId}
            onChange={(value) => {
              setMembershipOrgId(value);
              setMembershipRole(getRoleOptionsForOrg(orgOptions, value)[0]?.value ?? "org_member");
            }}
            options={membershipOrgOptions}
            placeholder="Search organizations…"
            emptyLabel="Add to organization"
          />
          <div className="flex gap-2">
            <Select value={membershipRole} onValueChange={setMembershipRole} disabled={!membershipOrgId}>
              <SelectTrigger aria-label="Membership role" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getRoleOptionsForOrg(orgOptions, membershipOrgId).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !membershipOrgId}
              onClick={() => void onAddMembership()}
            >
              Add membership
            </Button>
          </div>
        </div>
      </SheetSection>

      <SheetSection title="Crew">
        <VerticalsAndDisciplines
          verticals={form.watch("verticals")}
          disciplines={form.watch("disciplines")}
          onVerticalsChange={(next) => form.setValue("verticals", next, { shouldDirty: true })}
          onDisciplinesChange={(next) => form.setValue("disciplines", next, { shouldDirty: true })}
          idPrefix={field("teams")}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1" data-testid="person-rate">
            <Label htmlFor={field("rate")}>Hourly rate</Label>
            <Select
              value={rateMode}
              onValueChange={(value) =>
                form.setValue("rateMode", value as CrewRateModeOption, { shouldDirty: true })
              }
            >
              <SelectTrigger id={field("rate")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {rateMode === "custom" ? (
              <Input
                aria-label="Custom hourly rate (USD)"
                inputMode="decimal"
                placeholder="USD"
                {...form.register("hourlyRateUsd")}
              />
            ) : (
              <p className="text-xs text-muted-foreground tabular-nums">
                ${user.hourlyRateUsd ?? 0}/hr (synced)
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={field("payroll")}>Payment method</Label>
            <Select
              value={form.watch("payrollMethod")}
              onValueChange={(value) =>
                form.setValue("payrollMethod", value as PayrollMethodOption, { shouldDirty: true })
              }
            >
              <SelectTrigger id={field("payroll")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stanford">Stanford payroll</SelectItem>
                <SelectItem value="external">External payroll</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          {participation.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <Label htmlFor={field(key)} className="font-normal">
                {label}
              </Label>
              <Switch
                id={field(key)}
                checked={form.watch(key)}
                onCheckedChange={(checked) => form.setValue(key, checked, { shouldDirty: true })}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          <Link href={`/dashboard/users/timecards/${user.id}`} className="underline underline-offset-2">
            Timecards
          </Link>{" "}
          ·{" "}
          <Link href="/dashboard/users/crew-rates" className="underline underline-offset-2">
            Crew rates
          </Link>
        </p>
      </SheetSection>

      <SheetSection title="Public crew page">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={field("public")} className="font-normal">
            Show on public crew page
          </Label>
          <Switch
            id={field("public")}
            checked={form.watch("showOnPublicCrewPage")}
            onCheckedChange={(checked) =>
              form.setValue("showOnPublicCrewPage", checked, { shouldDirty: true })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={field("bio")}>Description</Label>
          <Textarea
            id={field("bio")}
            rows={3}
            placeholder="Short bio shown on the public crew page."
            {...form.register("publicCrewDescription")}
          />
        </div>
      </SheetSection>

      <SheetSection title="Email notifications">
        {emailPreferences === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : emailGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No email notifications apply to this person.</p>
        ) : (
          <div className="space-y-3">
            {emailGroups.map(([group, entries]) => (
              <div key={group} className="space-y-2">
                <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">{group}</p>
                {/* One column: the labels are long enough to wrap in two. */}
                <div className="space-y-2">
                  {entries.map((entry) => {
                    const id = field(`email-${entry.template}`);
                    return (
                      <div key={entry.template} className="flex items-start gap-2">
                        <Checkbox
                          className="mt-px"
                          id={id}
                          checked={!emailOptOuts.includes(entry.template)}
                          onCheckedChange={(checked) => setEmailPreference(entry.template, checked === true)}
                        />
                        <Label htmlFor={id} className="min-w-0 leading-snug font-normal">
                          {entry.label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetSection>

      {onboarding ? (
        <SheetSection title="Onboarding">
          <OnboardingChecklist onboarding={onboarding} />
          {isOnboardingIncomplete(onboarding) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void actions.waiveOnboarding(user)}
            >
              Waive onboarding
            </Button>
          ) : null}
        </SheetSection>
      ) : null}

      <SheetFooter className="sticky bottom-0 flex-row flex-wrap items-center justify-end gap-2 border-t bg-background">
        {form.saveError ? (
          <p className="mr-auto text-sm text-destructive">{form.saveError}</p>
        ) : isDirty ? (
          <p className="mr-auto text-sm text-muted-foreground">Unsaved changes</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void actions.sendPasswordReset(user)}
        >
          Send password reset
        </Button>
        {isDirty ? (
          <Button type="button" variant="outline" size="sm" onClick={() => form.reset(valuesFromUser(user))}>
            Discard
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={!isDirty || form.saveStatus === "saving"}
          onClick={() => void form.handleSubmit(onSave)()}
        >
          {form.saveStatus === "saving" ? "Saving…" : "Save changes"}
        </Button>
      </SheetFooter>
    </>
  );
}

function OnboardingChecklist({ onboarding }: { onboarding: CrewOnboardingRow }) {
  const done = (at: number | null | undefined) => (at ? "Done" : "Pending");
  const items: Array<[string, string]> = [
    ["Profile", done(onboarding.profileCompletedAt)],
    ["WhatsApp", done(onboarding.whatsappAcknowledgedAt)],
    ["Instagram", done(onboarding.instagramAcknowledgedAt)],
    [
      "FWS",
      onboarding.fwsAcknowledgedAt ? (onboarding.hasFederalWorkStudy ? "Yes" : "No") : "Pending",
    ],
    ["Narcan", done(onboarding.narcanCompletedAt)],
    ["Sober monitor", done(onboarding.soberMonitorCompletedAt)],
    ["Emergency SOPs", done(onboarding.emergencySopsAcknowledgedAt)],
    ["Expectations", done(onboarding.crewExpectationsAcknowledgedAt)],
    ["Lifting", done(onboarding.liftingCompletedAt)],
    ["Cart", onboarding.cartTrainingCompletedAt ? "Done" : "N/A or pending"],
    ["Student ID", onboarding.studentId ?? "Pending"],
    [
      "Start date",
      onboarding.employmentStartDate ? formatDate(onboarding.employmentStartDate) : "Pending",
    ],
    [
      "Other employment",
      onboarding.hasOtherCampusEmployment == null
        ? "Pending"
        : onboarding.hasOtherCampusEmployment
          ? `${onboarding.otherCampusEmploymentHours ?? 0} hrs/week`
          : "No",
    ],
    ["I-9", done(onboarding.i9AcknowledgedAt)],
    ["Timecard", done(onboarding.timecardAcknowledgedAt)],
    [
      "Signed",
      onboarding.agreedToOnboardingDocAt ? (onboarding.signatureLegalName ?? "Yes") : "Pending",
    ],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className={value === "Pending" ? "text-status-amber-700 dark:text-status-amber-200" : undefined}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

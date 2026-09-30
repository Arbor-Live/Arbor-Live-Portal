"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/lib/convex-api";
import type { Tone } from "@/components/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  USER_VERTICAL_OPTIONS,
  disciplinesForVerticals,
  type UserDisciplineOption,
  type UserVerticalOption,
} from "@/lib/validations/users";

export type OrgOption = FunctionReturnType<typeof api.users.listOrganizationsAdmin>[number];
export type AdminUser = FunctionReturnType<typeof api.users.listUsersForAdmin>[number];
export type InviteRow = FunctionReturnType<typeof api.users.listInvitationsAdmin>[number];
export type BandOrgRow = FunctionReturnType<typeof api.users.listBandOrganizationsAdmin>[number];
export type CrewOnboardingRow = FunctionReturnType<
  typeof api.onboarding.listCrewOnboardingForAdmin
>[number];

export type UserStatus = AdminUser["status"];
export type InviteStatus = "pending" | "accepted" | "expired" | "cancelled";

/** Filter value meaning "don't filter by organization". */
export const ALL_ORGS = "__all__";

export const USER_STATUS_OPTIONS: Array<{ value: UserStatus; label: string; tone: Tone }> = [
  { value: "active", label: "Active", tone: "emerald" },
  { value: "inactive", label: "Inactive", tone: "neutral" },
  { value: "alumni", label: "Alumni", tone: "rose" },
];

export function userStatusOption(status: UserStatus) {
  return USER_STATUS_OPTIONS.find((option) => option.value === status) ?? USER_STATUS_OPTIONS[0];
}

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** Blue while we wait on the invitee, amber when an expired invite needs a resend. */
export const INVITE_STATUS_TONES: Record<InviteStatus, Tone> = {
  pending: "blue",
  accepted: "emerald",
  expired: "amber",
  cancelled: "rose",
};

export function inviteStatus(value: string): InviteStatus {
  return value in INVITE_STATUS_LABELS ? (value as InviteStatus) : "pending";
}

/** The fixed-width status chip at the end of a row, so rows align. */
export const STATUS_CHIP: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  blue: "bg-status-blue-500/15 text-status-blue-700 dark:text-status-blue-200",
  emerald: "bg-status-emerald-500/15 text-status-emerald-700 dark:text-status-emerald-200",
  amber: "bg-status-amber-500/15 text-status-amber-800 dark:text-status-amber-200",
  rose: "bg-status-rose-500/15 text-status-rose-700 dark:text-status-rose-200",
};

export const FLAG_CLASS =
  "rounded-md bg-status-amber-500/15 px-2 py-0.5 text-xs text-status-amber-800 dark:text-status-amber-200";

const ROLE_LABELS: Record<string, string> = {
  // Better Auth's default role; the app treats it as a plain member.
  user: "Member",
  member: "Member",
  admin: "Admin",
  org_member: "Org Member",
  org_admin: "Org Admin",
};

export function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? role;
}

export function isArborOrg(orgOptions: OrgOption[], orgId: string) {
  const org = orgOptions.find((entry) => entry.id === orgId);
  if (!org) return false;
  if (org.organizationType === "arbor_internal") return true;
  const name = org.name.trim().toLowerCase();
  const slug = (org.slug ?? "").trim().toLowerCase();
  return name === "arbor live" || slug === "arbor-live";
}

export function findArborLiveOrgId(orgOptions: OrgOption[]) {
  const byType = orgOptions.find((org) => org.organizationType === "arbor_internal");
  if (byType) return byType.id;
  const byName = orgOptions.find((org) => {
    const name = org.name.trim().toLowerCase();
    const slug = (org.slug ?? "").trim().toLowerCase();
    return name === "arbor live" || slug === "arbor-live";
  });
  return byName?.id ?? "";
}

export function getRoleOptionsForOrg(orgOptions: OrgOption[], orgId: string) {
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

export function isOnboardingIncomplete(row: CrewOnboardingRow | null | undefined) {
  return row?.status === "not_started" || row?.status === "in_progress";
}

/** Drop disciplines that are no longer available once verticals change. */
export function pruneDisciplinesForVerticals(
  verticals: UserVerticalOption[],
  disciplines: UserDisciplineOption[],
): UserDisciplineOption[] {
  const allowed = new Set(disciplinesForVerticals(verticals));
  return disciplines.filter((discipline) => allowed.has(discipline));
}

function toggleOption<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function OptionCheckboxes<T extends string>({
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
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
        {options.map((option) => {
          const id = `${idPrefix}-${option}`;
          return (
            <div key={id} className="flex min-w-0 items-start gap-2">
              <Checkbox
                className="mt-px"
                id={id}
                checked={values.includes(option)}
                onCheckedChange={() => onChange(toggleOption(values, option))}
              />
              <Label htmlFor={id} className="min-w-0 leading-snug font-normal">
                {option}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Verticals plus the disciplines they unlock. Disciplines are scoped to the
 * selected verticals, so changing verticals drops any now-invalid specialty.
 */
export function VerticalsAndDisciplines({
  verticals,
  disciplines,
  onVerticalsChange,
  onDisciplinesChange,
  idPrefix,
}: {
  verticals: UserVerticalOption[];
  disciplines: UserDisciplineOption[];
  onVerticalsChange: (next: UserVerticalOption[]) => void;
  onDisciplinesChange: (next: UserDisciplineOption[]) => void;
  idPrefix: string;
}) {
  const disciplineOptions = disciplinesForVerticals(verticals);
  // Sized to its container, not the viewport: side by side in the Add person
  // dialog, stacked in a side panel where two columns would crowd the labels.
  return (
    <div className="@container/teams">
      <div className="grid gap-4 @lg/teams:grid-cols-2">
        <OptionCheckboxes
          label="Verticals"
          options={USER_VERTICAL_OPTIONS}
          values={verticals}
          onChange={(next) => {
            onVerticalsChange(next);
            onDisciplinesChange(pruneDisciplinesForVerticals(next, disciplines));
          }}
          idPrefix={`${idPrefix}-vertical`}
        />
        {disciplineOptions.length > 0 ? (
          <OptionCheckboxes
            label="Disciplines"
            options={disciplineOptions}
            values={disciplines}
            onChange={onDisciplinesChange}
            idPrefix={`${idPrefix}-discipline`}
          />
        ) : null}
      </div>
    </div>
  );
}

export function SheetSection({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="space-y-3 border-t px-4 py-4" data-testid={testId}>
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** The open side panel as a URL param (`?user=<id>`); shared with other list pages. */
export { useSheetParam } from "@/hooks/use-sheet-param";

/** Dashed empty state for a list, saying what to do next. */
export function EmptyRows({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CaretRightIcon, DotsThreeIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useConvexForm } from "@/hooks/use-convex-form";
import { ListRow } from "@/components/list-row";
import { StatusPill } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  EmptyRows,
  INVITE_STATUS_LABELS,
  INVITE_STATUS_TONES,
  STATUS_CHIP,
  SheetSection,
  VerticalsAndDisciplines,
  getRoleOptionsForOrg,
  inviteStatus,
  isArborOrg,
  pruneDisciplinesForVerticals,
  roleLabel,
  useSheetParam,
  type InviteRow,
  type InviteStatus,
  type OrgOption,
} from "@/components/users/directory/shared";
import { OrgFilterSelect, useUsersDirectory } from "@/components/users/directory/users-directory-shell";
import {
  editInviteSchema,
  type EditInviteFormValues,
  type UserDisciplineOption,
  type UserVerticalOption,
} from "@/lib/validations/users";

type StatusFilter = InviteStatus | "all";

const STATUS_FILTERS: StatusFilter[] = ["pending", "expired", "accepted", "cancelled", "all"];

/** Invite actions shared by a row's `⋯` menu and the invite panel. Each returns whether it succeeded. */
function useInviteActions() {
  const { confirm } = useAppDialog();
  const resendInvite = useMutation(api.users.resendInviteAdmin);
  const cancelInvite = useMutation(api.users.cancelInviteAdmin);
  return {
    async resend(invite: InviteRow) {
      try {
        await resendInvite({ invitationId: invite.id });
        notify.success("Invite resent.");
        return true;
      } catch (error) {
        notify.error(getConvexErrorMessage(error));
        return false;
      }
    },
    async cancel(invite: InviteRow) {
      const confirmed = await confirm({
        title: `Cancel the invitation for ${invite.email}?`,
        description: "The invite link stops working. You can invite them again later.",
        confirmLabel: "Cancel invitation",
        destructive: true,
      });
      if (!confirmed) return false;
      try {
        await cancelInvite({ invitationId: invite.id });
        notify.success(`Invitation cancelled for ${invite.email}.`);
        return true;
      } catch (error) {
        notify.error(getConvexErrorMessage(error));
        return false;
      }
    },
  };
}

/** Invitations to the filtered organization, newest first, with a side panel to edit, resend, or cancel. */
export function InvitationsTab() {
  const { orgOptions, filterOrgId, openAddPerson } = useUsersDirectory();
  const invitations = useQuery(
    api.users.listInvitationsAdmin,
    orgOptions === undefined ? "skip" : { organizationId: filterOrgId },
  );
  const actions = useInviteActions();
  const [selectedId, setSelectedId] = useSheetParam("invite");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");

  const counts = useMemo(() => {
    const result: Record<InviteStatus, number> = { pending: 0, accepted: 0, expired: 0, cancelled: 0 };
    for (const invite of invitations ?? []) result[inviteStatus(invite.status)] += 1;
    return result;
  }, [invitations]);

  const rows = useMemo(
    () =>
      (invitations ?? []).filter((invite) => {
        if (statusFilter !== "all" && inviteStatus(invite.status) !== statusFilter) return false;
        if (!query) return true;
        return [invite.email, invite.organizationName, invite.inviterName, invite.role]
          .join(" ")
          .toLowerCase()
          .includes(query);
      }),
    [invitations, statusFilter, query],
  );

  const selectedInvite = invitations?.find((invite) => invite.id === selectedId) ?? null;

  return (
    <div className="space-y-3" data-testid="invitations-tab">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search invitations"
            placeholder="Search email or inviter…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <OrgFilterSelect />
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          aria-label="Invitation status"
          value={statusFilter}
          onValueChange={(value) => value && setStatusFilter(value as StatusFilter)}
        >
          {STATUS_FILTERS.map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {value === "all" ? "All" : INVITE_STATUS_LABELS[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {invitations === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <>
          <p className="text-sm" data-testid="invitations-summary">
            {invitations.length} invitation{invitations.length === 1 ? "" : "s"} · {counts.pending} pending ·{" "}
            {counts.expired} expired · {counts.accepted} accepted · {counts.cancelled} cancelled
            <span className="text-muted-foreground"> · Newest first</span>
          </p>
          {rows.length === 0 ? (
            <EmptyRows>
              {invitations.length === 0 ? (
                <>
                  No invitations for this organization yet.{" "}
                  <button type="button" className="underline underline-offset-2" onClick={openAddPerson}>
                    Add a person
                  </button>{" "}
                  to send one.
                </>
              ) : (
                "No invitations match. Pick another status, or clear the search."
              )}
            </EmptyRows>
          ) : (
            <ul className="space-y-2">
              {rows.map((invite) => (
                <InviteRowItem
                  key={invite.id}
                  invite={invite}
                  onOpen={() => setSelectedId(invite.id)}
                  onResend={() => void actions.resend(invite)}
                  onCancel={() => void actions.cancel(invite)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <InviteSheet
        invite={selectedInvite}
        orgOptions={orgOptions ?? []}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}

function InviteRowItem({
  invite,
  onOpen,
  onResend,
  onCancel,
}: {
  invite: InviteRow;
  onOpen: () => void;
  onResend: () => void;
  onCancel: () => void;
}) {
  const status = inviteStatus(invite.status);
  const pending = status === "pending";
  return (
    <ListRow
      data-testid={`invite-row-${invite.id}`}
      onOpen={onOpen}
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${invite.email}`}>
              <DotsThreeIcon className="size-4" weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpen}>Open details</DropdownMenuItem>
            {pending || status === "expired" ? (
              <DropdownMenuItem onSelect={onResend}>Resend invite</DropdownMenuItem>
            ) : null}
            {pending ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onCancel}>
                  Cancel invitation
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {invite.organizationName}
        </p>
        <p className="truncate font-medium">{invite.email}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span data-testid="invite-role">{roleLabel(invite.role)}</span> · Invited by {invite.inviterName}
          {invite.createdAt ? ` · ${formatDate(invite.createdAt)}` : ""}
        </p>
      </div>
      <span className="hidden w-44 shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums md:block">
        {pending && invite.expiresAt ? `Expires ${formatDate(invite.expiresAt)}` : null}
      </span>
      <span
        data-testid="invite-status"
        className={cn(
          "w-20 shrink-0 rounded-md py-0.5 text-center text-xs font-medium",
          STATUS_CHIP[INVITE_STATUS_TONES[status]],
        )}
      >
        {INVITE_STATUS_LABELS[status]}
      </span>
      <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </ListRow>
  );
}

function InviteSheet({
  invite,
  orgOptions,
  onOpenChange,
}: {
  invite: InviteRow | null;
  orgOptions: OrgOption[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={invite !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="invite-sheet">
        {invite ? (
          // Keyed so drafts reset when another invite opens.
          <InviteSheetBody key={invite.id} invite={invite} orgOptions={orgOptions} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function inviteValues(invite: InviteRow): EditInviteFormValues {
  const verticals = invite.verticals as UserVerticalOption[];
  return {
    role: invite.role,
    verticals,
    disciplines: pruneDisciplinesForVerticals(verticals, invite.disciplines as UserDisciplineOption[]),
  };
}

function InviteSheetBody({ invite, orgOptions }: { invite: InviteRow; orgOptions: OrgOption[] }) {
  const actions = useInviteActions();
  const updateInvite = useMutation(api.users.updateInviteAdmin);
  const [busy, setBusy] = useState(false);
  const status = inviteStatus(invite.status);
  const pending = status === "pending";
  const arborOrg = isArborOrg(orgOptions, invite.organizationId);

  const form = useConvexForm<EditInviteFormValues>({
    schema: editInviteSchema,
    defaultValues: inviteValues(invite),
    mode: "onTouched",
  });
  const { isDirty } = form.formState;

  useEffect(() => {
    // Bail while dirty: `form` changes identity when `isDirty` flips, so
    // without this the first edit would reset itself away.
    if (form.formState.isDirty) return;
    form.reset(inviteValues(invite));
  }, [invite, form]);

  const onSave = form.submitMutation(
    async (values) => {
      await updateInvite({
        invitationId: invite.id,
        role: values.role,
        verticals: arborOrg ? values.verticals : undefined,
        disciplines: arborOrg ? values.disciplines : undefined,
      });
      return values;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
        notify.success("Invitation updated.");
      },
    },
  );

  // The panel stays open after both actions: a cancelled invite keeps its
  // row (now Cancelled), so the admin sees the result where they acted.
  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const details: Array<[string, string]> = [
    ["Organization", invite.organizationName],
    ["Invited by", invite.inviterName],
    ["Sent", invite.createdAt ? formatDate(invite.createdAt) : "—"],
    [status === "expired" ? "Expired" : "Expires", invite.expiresAt ? formatDate(invite.expiresAt) : "—"],
  ];

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate">{invite.email}</span>
          <StatusPill tone={INVITE_STATUS_TONES[status]}>{INVITE_STATUS_LABELS[status]}</StatusPill>
        </SheetTitle>
        <SheetDescription>
          {pending
            ? "Waiting for them to accept. Edits apply when they do."
            : status === "expired"
              ? "The link has expired. Resend to give them a fresh one."
              : `Invited as ${roleLabel(invite.role)}.`}
        </SheetDescription>
      </SheetHeader>

      <SheetSection title="Invitation">
        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-y-1 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="truncate">{value}</dd>
            </div>
          ))}
        </dl>
      </SheetSection>

      <SheetSection title="Role and teams">
        <fieldset disabled={!pending} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor={`invite-${invite.id}-role`}>Role</Label>
            <Select
              value={form.watch("role")}
              onValueChange={(value) => form.setValue("role", value, { shouldDirty: true })}
              disabled={!pending}
            >
              <SelectTrigger id={`invite-${invite.id}-role`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getRoleOptionsForOrg(orgOptions, invite.organizationId).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {arborOrg ? (
            <VerticalsAndDisciplines
              verticals={form.watch("verticals")}
              disciplines={form.watch("disciplines")}
              onVerticalsChange={(next) => form.setValue("verticals", next, { shouldDirty: true })}
              onDisciplinesChange={(next) => form.setValue("disciplines", next, { shouldDirty: true })}
              idPrefix={`invite-${invite.id}`}
            />
          ) : null}
        </fieldset>
        {pending ? (
          <div className="flex items-center justify-end gap-2">
            {form.saveError ? <p className="mr-auto text-sm text-destructive">{form.saveError}</p> : null}
            <Button
              type="button"
              size="sm"
              disabled={!isDirty || form.saveStatus === "saving"}
              onClick={() => void form.handleSubmit(onSave)()}
            >
              {form.saveStatus === "saving" ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </SheetSection>

      {pending || status === "expired" ? (
        <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void run(() => actions.resend(invite))}
          >
            Resend invite
          </Button>
          {pending ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => actions.cancel(invite))}
            >
              Cancel invitation
            </Button>
          ) : null}
        </SheetFooter>
      ) : null}
    </>
  );
}

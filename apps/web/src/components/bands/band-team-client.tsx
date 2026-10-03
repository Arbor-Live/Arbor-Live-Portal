"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { EnvelopeSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { formatDate } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import {
  bandInviteSchema,
  type BandInviteFormValues,
} from "@/lib/validations/bands";
import { useConvexForm } from "@/hooks/use-convex-form";
import { UserAvatar } from "@/components/account/user-avatar";
import { TextFormField } from "@/components/forms/text-form-field";
import { ListRow } from "@/components/list-row";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  EmptyState,
  ListSummary,
  RowGroup,
  RowMenu,
  RowText,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { StatusPill } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Member = NonNullable<
  ReturnType<typeof useQuery<typeof api.users.listMembersForActiveOrganization>>
>[number];

const ACCESS_LABELS: Record<string, string> = {
  org_admin: "Admin",
  org_member: "Member",
};

function accessLabel(role: string) {
  return ACCESS_LABELS[role] ?? "Member";
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const inviteMember = useMutation(api.users.inviteMemberToActiveOrganization);
  const form = useConvexForm<BandInviteFormValues>({
    schema: bandInviteSchema,
    defaultValues: { email: "", role: "org_member", bandRole: "" },
    mode: "onTouched",
  });

  const onInvite = form.submitMutation(
    async (values) => {
      const result = await inviteMember({
        email: values.email.trim(),
        role: values.role,
        bandRole: values.bandRole?.trim() || undefined,
      });
      return { ...values, resent: result.resent };
    },
    {
      onSuccess: (values) => {
        notify.success(
          values.resent
            ? `Invitation resent to ${values.email.trim()}.`
            : `Invitation sent to ${values.email.trim()}.`,
        );
        form.reset({ email: "", role: values.role, bandRole: "" });
        onOpenChange(false);
      },
    },
  );

  // Radix only calls the Dialog's onOpenChange for its own dismissals, so the
  // Cancel button goes through this too.
  function close() {
    form.reset({ email: "", role: "org_member", bandRole: "" });
    form.resetSaveState();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent data-testid="artist-invite-dialog">
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            They get an email to join your act in the portal. Their role is how Arbor knows who
            plays what.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onInvite)} className="space-y-3">
            <TextFormField name="email" label="Email address" placeholder="name@example.com" type="email" />
            <TextFormField name="bandRole" label="Role" placeholder="Guitarist, vocals…" />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access level</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl className="w-full">
                      <SelectTrigger className="w-full shadow-none">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="org_member">Member</SelectItem>
                      <SelectItem value="org_admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.saveError ? (
              <Alert variant="destructive">
                <AlertTitle>Invitation not sent</AlertTitle>
                <AlertDescription>{form.saveError}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.saveStatus === "saving"}>
                {form.saveStatus === "saving" ? "Sending…" : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function MemberSheetBody({ member, onDone }: { member: Member; onDone: () => void }) {
  const updateMemberBandRole = useMutation(api.users.updateMemberBandRole);
  const [bandRole, setBandRole] = useState(member.bandRole ?? "");
  const [busy, setBusy] = useState(false);
  const changed = bandRole.trim() !== (member.bandRole ?? "");

  async function onSave() {
    setBusy(true);
    try {
      await updateMemberBandRole({ userId: member.userId, bandRole: bandRole.trim() });
      notify.success(`Saved ${member.name}'s role.`);
      onDone();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DetailSheetHeader
        title={member.name}
        pill={
          <StatusPill tone={member.active ? "emerald" : "neutral"}>
            {member.active ? "Active" : "Inactive"}
          </StatusPill>
        }
        description={member.email || undefined}
      />
      <SheetSection title="In the act">
        <div className="space-y-1.5">
          <Label htmlFor={`band-member-role-${member.userId}`}>Role</Label>
          <Input
            id={`band-member-role-${member.userId}`}
            value={bandRole}
            onChange={(event) => setBandRole(event.target.value)}
            placeholder="Guitarist, vocals…"
          />
          <p className="text-xs text-muted-foreground">
            Shown to Arbor staff when they book you and prep your stage.
          </p>
        </div>
      </SheetSection>
      <SheetSection title="Portal access">
        <SheetFields>
          <SheetField label="Access level">{accessLabel(member.role)}</SheetField>
          <SheetField label="Status">{member.active ? "Active" : "Inactive"}</SheetField>
        </SheetFields>
      </SheetSection>
      <DetailSheetFooter>
        <Button type="button" size="sm" disabled={!changed || busy} onClick={() => void onSave()}>
          {busy ? "Saving…" : "Save role"}
        </Button>
      </DetailSheetFooter>
    </>
  );
}

/**
 * The Team tab: the act's portal members and pending invitations. A member's
 * role ("Guitarist") is how Arbor knows who's in the group, so there's no
 * separate member list to maintain.
 */
export function BandTeamClient() {
  const members = useQuery(api.users.listMembersForActiveOrganization, {});
  const pendingInvites = useQuery(api.users.listPendingInvitesForActiveOrganization, {});
  const resendInvite = useMutation(api.users.resendInviteForActiveOrganization);
  const cancelInvite = useMutation(api.users.cancelInviteForActiveOrganization);
  const { confirm } = useAppDialog();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);

  const openMember = members?.find((member) => member.userId === openMemberId) ?? null;

  async function onResendInvite(invite: { invitationId: string; email: string }) {
    if (inviteBusyId) return;
    setInviteBusyId(invite.invitationId);
    try {
      await resendInvite({ invitationId: invite.invitationId });
      notify.success(`Invitation resent to ${invite.email}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setInviteBusyId(null);
    }
  }

  async function onRemoveInvite(invite: { invitationId: string; email: string }) {
    if (inviteBusyId) return;
    const confirmed = await confirm({
      title: `Remove the invitation for ${invite.email}?`,
      description: "The link in their email stops working. You can invite them again later.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;
    setInviteBusyId(invite.invitationId);
    try {
      await cancelInvite({ invitationId: invite.invitationId });
      notify.success(`Invitation removed for ${invite.email}.`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setInviteBusyId(null);
    }
  }

  if (members === undefined) {
    return <p className="text-sm text-muted-foreground">Loading your team…</p>;
  }

  const activeCount = members.filter((member) => member.active).length;
  const pendingCount = pendingInvites?.length ?? 0;

  return (
    <div className="space-y-4" data-testid="artist-team">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ListSummary testId="artist-team-summary" order="Members by name, then invitations waiting for a reply.">
          {[
            `${members.length} member${members.length === 1 ? "" : "s"}`,
            activeCount < members.length ? `${activeCount} active` : null,
            pendingCount > 0 ? `${pendingCount} invitation${pendingCount === 1 ? "" : "s"} pending` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </ListSummary>
        <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
          <PlusIcon weight="bold" />
          Invite member
        </Button>
      </div>

      <div className="border">
        <RowGroup title="Members" count={members.length} testId="artist-team-members">
          {members.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">No members yet.</li>
          ) : (
            members.map((member) => (
              <ListRow
                key={member.userId}
                data-testid={`artist-member-row-${member.userId}`}
                onOpen={() => setOpenMemberId(member.userId)}
              >
                <UserAvatar
                  name={member.name}
                  email={member.email}
                  userId={member.userId}
                  imageUrl={member.avatarUrl ?? member.image}
                  size="sm"
                />
                <RowText
                  eyebrow={member.bandRole || "No role yet"}
                  title={member.name}
                  detail={member.email}
                />
                <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground sm:block">
                  {accessLabel(member.role)}
                </span>
                <span className="flex w-20 shrink-0 justify-end">
                  <StatusPill tone={member.active ? "emerald" : "neutral"}>
                    {member.active ? "Active" : "Inactive"}
                  </StatusPill>
                </span>
              </ListRow>
            ))
          )}
        </RowGroup>
        <RowGroup
          title="Pending invitations"
          count={pendingCount}
          className="border-t"
          testId="artist-team-invites"
        >
          {pendingInvites === undefined ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">Loading invitations…</li>
          ) : pendingInvites.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">
              No invitations waiting for a reply.
            </li>
          ) : (
            pendingInvites.map((invite) => (
              <li
                key={invite.invitationId}
                data-testid={`artist-invite-row-${invite.invitationId}`}
                className="flex items-center gap-3 py-2.5 pr-1 pl-3 text-sm"
              >
                <span className="flex size-8 shrink-0 items-center justify-center border border-dashed text-muted-foreground">
                  <EnvelopeSimpleIcon className="size-4" aria-hidden />
                </span>
                <RowText
                  eyebrow={invite.bandRole || "No role yet"}
                  title={invite.email}
                  detail={`${accessLabel(invite.role)} access · expires ${
                    invite.expiresAt ? formatDate(invite.expiresAt) : "soon"
                  }`}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={inviteBusyId !== null}
                  onClick={() => void onResendInvite(invite)}
                >
                  Resend
                </Button>
                <RowMenu label={`More for the invitation to ${invite.email}`}>
                  <DropdownMenuItem variant="destructive" onSelect={() => void onRemoveInvite(invite)}>
                    Remove invitation
                  </DropdownMenuItem>
                </RowMenu>
              </li>
            ))
          )}
        </RowGroup>
      </div>

      {members.length === 1 && pendingCount === 0 ? (
        <EmptyState>
          It&apos;s just you so far. Invite the rest of the act so they can see shows and sign
          payouts.
        </EmptyState>
      ) : null}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <DetailSheet
        open={openMember !== null}
        onOpenChange={(open) => {
          if (!open) setOpenMemberId(null);
        }}
        testId="artist-member-sheet"
      >
        {openMember ? (
          <MemberSheetBody
            key={openMember.userId}
            member={openMember}
            onDone={() => setOpenMemberId(null)}
          />
        ) : null}
      </DetailSheet>
    </div>
  );
}

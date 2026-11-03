"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArtistSelect, artistSelectOptions } from "@/components/bands/artist-select";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/inventory/searchable-select";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatBandPayeePayoutMethod } from "@/lib/band-payout-copy";
import { getEventEditorTabPath } from "@/lib/event-editor-tabs";
import { eventBandOnboardingInviteSchema } from "@/lib/validations/bands";
import { describeBookingPrice } from "@/components/events/lineup/booking-price";

/**
 * Forms used from the Lineup: book an existing artist, invite one, and add or
 * refresh a payout. A payout's amount is never typed: it is the booking's
 * price (set on the position, or by the quote that bills it).
 */

export type ParticipationRole = "headliner" | "support" | "other";

export type PerformerRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.eventBands.listPerformersForEvent>>
>[number];

type PaymentFields = NonNullable<PerformerRow["payment"]>;

/** An act a quote bills that isn't on the Lineup yet. */
export type InvoiceArtistSuggestion = {
  organizationId: string;
  label: string;
};

const ROLE_OPTIONS = [
  { value: "headliner", label: "Headliner" },
  { value: "support", label: "Support" },
  { value: "other", label: "Other" },
];

export function InviteBandForm({
  eventId,
  needId,
  embedded = false,
  onDirtyChange,
  onSaved,
  onCancel,
}: {
  eventId: Id<"events">;
  /** Position to fill; omitted means the artist gets a new position. */
  needId?: Id<"eventArtistNeeds">;
  /** Inside a dialog or side panel: no card border or heading. */
  embedded?: boolean;
  /** Reports whether the form holds input that hasn't been sent yet. */
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const inviteBand = useMutation(api.eventBands.inviteBandFromEvent);
  const [email, setEmail] = useState("");
  const [artistName, setArtistName] = useState("");
  const [role, setRole] = useState<ParticipationRole>("headliner");
  const [busy, setBusy] = useState(false);

  const formSignature = JSON.stringify({ email, artistName, role });
  // Sent values become the new baseline: a delivered invite is no longer uncommitted.
  const [baseline, setBaseline] = useState(formSignature);
  const isDirty = formSignature !== baseline;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  async function onSubmit() {
    const parsed = eventBandOnboardingInviteSchema.safeParse({ email, artistName, role });
    if (!parsed.success) {
      notify.error(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setBusy(true);
    try {
      await inviteBand({
        eventId,
        needId,
        email: parsed.data.email,
        artistName: parsed.data.artistName,
        role: parsed.data.role,
      });
      notify.success(`Invite sent to ${parsed.data.email}.`);
      setBaseline(formSignature);
      onSaved();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={embedded ? "space-y-3" : "space-y-3 rounded-md border bg-muted/10 p-4"}>
      {embedded ? null : <p className="text-sm font-medium">Invite new artist</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="invite-band-artist-name">Artist name</Label>
          <Input
            id="invite-band-artist-name"
            value={artistName}
            onChange={(e) => setArtistName(e.target.value)}
            placeholder="The Redwoods"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="invite-band-email">Contact email</Label>
          <Input
            id="invite-band-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="artist@stanford.edu"
            autoComplete="email"
          />
        </div>
        <div className="space-y-1">
          <Label>Role</Label>
          <SearchableSelect
            value={role}
            onChange={(value) => setRole(value as ParticipationRole)}
            options={ROLE_OPTIONS}
            placeholder="Role"
            emptyLabel="Role"
          />
        </div>
        <p className="text-sm text-muted-foreground md:col-span-2">
          Price the act on its position once it&apos;s on the bill; its payout follows that price.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void onSubmit()} disabled={busy}>
          {busy ? "Sending…" : "Send invite"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function AddBandForm({
  eventId,
  positionOptions,
  defaultNeedId,
  hidePosition = false,
  excludedOrganizationIds,
  embedded = false,
  onDirtyChange,
  onSaved,
  onCancel,
}: {
  eventId: Id<"events">;
  /** Open positions this artist can be booked into. */
  positionOptions: SearchableSelectOption[];
  /** Preselected when launched from a position. */
  defaultNeedId?: string;
  /** Booking into a known position (from its side panel): no picker. */
  hidePosition?: boolean;
  excludedOrganizationIds: string[];
  /** Inside a dialog or side panel: no card border or heading. */
  embedded?: boolean;
  /** Reports whether the form holds a selection that hasn't been booked yet. */
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const bands = useQuery(api.users.listBandOrganizationsAdmin, {});
  const addParticipation = useMutation(api.eventBands.addParticipation);
  const [organizationId, setOrganizationId] = useState("");
  const [role, setRole] = useState<ParticipationRole>("headliner");
  const [needId, setNeedId] = useState(defaultNeedId ?? "");
  const [busy, setBusy] = useState(false);

  const formSignature = JSON.stringify({ organizationId, role, needId });
  // Booked values become the new baseline: a confirmed booking is no longer uncommitted.
  const [baseline, setBaseline] = useState(formSignature);
  const isDirty = formSignature !== baseline;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const bandOptions = useMemo(
    () => artistSelectOptions(bands, { excludeOrganizationIds: excludedOrganizationIds }),
    [bands, excludedOrganizationIds],
  );

  async function onSave() {
    if (!organizationId) {
      notify.error("Select an artist.");
      return;
    }
    setBusy(true);
    try {
      await addParticipation({
        eventId,
        organizationId,
        role,
        needId: (needId || undefined) as Id<"eventArtistNeeds"> | undefined,
      });
      setBaseline(formSignature);
      onSaved();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={embedded ? "space-y-3" : "space-y-3 rounded-md border bg-muted/10 p-4"}>
      {embedded ? null : <p className="text-sm font-medium">Add artist</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>Artist</Label>
          <ArtistSelect
            value={organizationId}
            onChange={setOrganizationId}
            options={bandOptions}
            placeholder="Search artists…"
            emptyLabel="Select artist"
            clearable
          />
        </div>
        <div className="space-y-1">
          <Label>Role</Label>
          <SearchableSelect
            value={role}
            onChange={(value) => setRole(value as ParticipationRole)}
            options={ROLE_OPTIONS}
            placeholder="Role"
            emptyLabel="Role"
          />
        </div>
        {hidePosition ? null : (
          <div className="space-y-1">
            <Label>Position</Label>
            <SearchableSelect
              value={needId}
              onChange={setNeedId}
              options={[{ value: "", label: "New position" }, ...positionOptions]}
              placeholder="Position"
              emptyLabel="New position"
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void onSave()} disabled={busy}>
          {busy ? "Adding…" : "Assign artist"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Add or refresh an act's payout: who it goes to and where it stands. The
 * amount is read-only here; it pays the booking's price, which is set on the
 * act's position on the Lineup (or by the quote that bills it).
 */
export function EventBandPaymentForm({
  eventId,
  organizationId: lockedOrganizationId,
  role,
  payment,
  organizationLocked,
  excludedOrganizationIds,
  embedded = false,
  showPayee = true,
  showStatus = true,
  actionsClassName,
  onSaved,
  onCancel,
}: {
  eventId: Id<"events">;
  organizationId?: string;
  /** Omitted when editing from the payout queue, where the participation role isn't known. */
  role?: ParticipationRole;
  payment: Pick<
    PaymentFields,
    | "_id"
    | "pricingMode"
    | "ratePerMemberPerHourUsd"
    | "performanceHours"
    | "memberCount"
    | "totalUsd"
    | "status"
    | "statusLabel"
    | "designatedPayeeName"
    | "designatedPayeeEmail"
    | "designatedPayeeMailingAddress"
    | "designatedPayeePayoutMethod"
    | "payeeComplete"
    | "eventEnded"
  > | null;
  organizationLocked?: boolean;
  excludedOrganizationIds: string[];
  /** Inside a dialog or side panel: no card border or heading. */
  embedded?: boolean;
  /** Hide the read-only payee block where the surrounding panel already shows payee details. */
  showPayee?: boolean;
  /** Hide the status card where the surrounding panel already shows payout status. */
  showStatus?: boolean;
  /** Extra classes for the action row, e.g. `justify-end` inside a dialog footer. */
  actionsClassName?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const bands = useQuery(api.users.listBandOrganizationsAdmin, {});
  const upsert = useMutation(api.bandPayments.upsertForEvent);

  const [organizationId, setOrganizationId] = useState(lockedOrganizationId ?? "");
  const resolvedOrgId = organizationLocked
    ? (lockedOrganizationId ?? "")
    : organizationId;
  const [busy, setBusy] = useState(false);

  const orgPayee = useQuery(
    api.bandPayments.getBandPayeeForOrganization,
    resolvedOrgId ? { organizationId: resolvedOrgId } : "skip",
  );

  const bandOptions = useMemo(
    () => artistSelectOptions(bands, { excludeOrganizationIds: excludedOrganizationIds }),
    [bands, excludedOrganizationIds],
  );

  const payeeComplete = orgPayee?.payeeComplete ?? payment?.payeeComplete ?? false;
  const paid = payment?.status === "paid";

  async function onSave() {
    if (!resolvedOrgId) {
      notify.error("Select an artist.");
      return;
    }
    setBusy(true);
    try {
      await upsert({ eventId, paymentId: payment?._id, organizationId: resolvedOrgId, role });
      onSaved();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const displayPayeeName = payment?.designatedPayeeName ?? orgPayee?.designatedPayeeName ?? "";
  const displayPayeeEmail = payment?.designatedPayeeEmail ?? orgPayee?.designatedPayeeEmail ?? "";
  const displayPayeeAddress =
    payment?.designatedPayeeMailingAddress ?? orgPayee?.designatedPayeeMailingAddress ?? "";
  const displayPayoutMethod =
    payment?.designatedPayeePayoutMethod ?? orgPayee?.designatedPayeePayoutMethod;
  const lineupHref = resolvedOrgId
    ? `${getEventEditorTabPath(eventId, "artists")}?act=${encodeURIComponent(resolvedOrgId)}`
    : getEventEditorTabPath(eventId, "artists");

  return (
    <div className={embedded ? "space-y-4" : "space-y-4 rounded-md border bg-muted/10 p-4"}>
      {embedded ? null : (
        <p className="text-sm font-medium">{payment ? "Payout" : "Add payout"}</p>
      )}

      {payment && showStatus ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p>
            <span className="font-medium">Status:</span> {payment.statusLabel}
          </p>
          {payment.eventEnded && payment.status === "draft" ? (
            <p className="text-muted-foreground">
              This event has ended and will enter the payout queue on save.
            </p>
          ) : null}
          {payment.status === "pending_onboarding" ? (
            <p className="text-status-amber-700 dark:text-status-amber-300">
              Waiting for the artist to finish onboarding before payout can proceed.
            </p>
          ) : null}
          {payment.status === "pending_payee" && !payeeComplete ? (
            <p className="text-status-amber-700 dark:text-status-amber-300">
              Waiting for the artist to configure their designated payee before confirmation can be
              sent.
            </p>
          ) : null}
          {payment.status === "pending_payee" && payeeComplete ? (
            <p className="text-muted-foreground">
              Payee is on file for this artist. The payout queue will update automatically, or save
              this payment to refresh it now.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {!organizationLocked ? (
          <div className="space-y-1 md:col-span-2">
            <Label>Artist</Label>
            <ArtistSelect
              value={organizationId}
              onChange={setOrganizationId}
              options={bandOptions}
              placeholder="Search artists…"
              emptyLabel="Select artist"
              clearable
            />
          </div>
        ) : null}

        <div className="space-y-1 md:col-span-2" data-testid="payout-amount">
          <Label>Amount</Label>
          {payment ? (
            <p className="text-sm">
              <span className="font-medium tabular-nums">{formatUsd(payment.totalUsd)}</span>
              {describeBookingPrice(payment) ? (
                <span className="text-muted-foreground"> · {describeBookingPrice(payment)}</span>
              ) : null}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {paid
              ? "Paid, so it stays as it was paid."
              : "Pays the act's booking price, which the quote bills too. "}
            {paid ? null : (
              <Link href={lineupHref} className="text-primary underline-offset-4 hover:underline">
                Change the price on the Lineup
              </Link>
            )}
          </p>
        </div>

        {showPayee ? (
          <div className="space-y-2 md:col-span-2">
            <Label>Designated payee (from artist org profile)</Label>
            {resolvedOrgId ? (
              payeeComplete ? (
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                  <p>
                    <span className="font-medium">Payee:</span> {displayPayeeName} (
                    {displayPayeeEmail})
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">Payout method:</span>{" "}
                    {formatBandPayeePayoutMethod(displayPayoutMethod)}
                  </p>
                  {displayPayeeAddress ? (
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {displayPayeeAddress}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-md border border-dashed px-3 py-3 text-sm">
                  <p className="text-muted-foreground">
                    This artist has not configured a designated payee with mailing address and payout
                    method. Confirmation emails cannot be sent until payee info is on file.
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-2">
                    <Link href="/dashboard/artists/payments#payee">
                      Open artist payee settings
                    </Link>
                  </Button>
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Select an artist to view payee details.</p>
            )}
          </div>
        ) : null}
      </div>

      <div className={cn("flex flex-wrap gap-2", actionsClassName)}>
        {!paid ? (
          <Button type="button" onClick={() => void onSave()} disabled={busy}>
            {payment ? "Save payout" : "Add payout"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          {payment ? "Close" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}

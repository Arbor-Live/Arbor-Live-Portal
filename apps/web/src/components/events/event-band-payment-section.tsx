"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { addPacificCalendarDays, pacificDateKey } from "@arbor/format";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { formatUsd, formatDate } from "@/lib/format";
import { formatBandPayeePayoutMethod } from "@/lib/band-payout-copy";

type PricingMode = "per_member_hourly" | "fixed_total";
type ParticipationRole = "headliner" | "support" | "other";

type PerformerRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.eventBands.listPerformersForEvent>>
>[number];

type PaymentFields = NonNullable<PerformerRow["payment"]>;

const PRICING_OPTIONS = [
  { value: "per_member_hourly", label: "Per member per hour" },
  { value: "fixed_total", label: "Fixed total" },
];

const ROLE_OPTIONS = [
  { value: "headliner", label: "Headliner" },
  { value: "support", label: "Support" },
  { value: "other", label: "Other" },
];

function roleLabel(role: ParticipationRole) {
  return ROLE_OPTIONS.find((row) => row.value === role)?.label ?? role;
}

/** Number of calendar days (in the portal timezone) the event spans. */
function getEventDayCount(startAt: number | undefined, endAt: number | undefined) {
  if (!startAt || !endAt || endAt <= startAt) return 1;
  const endKey = pacificDateKey(endAt);
  let cursor = startAt;
  let count = 1;
  while (pacificDateKey(cursor) !== endKey && count < 14) {
    cursor = addPacificCalendarDays(cursor, 1);
    count += 1;
  }
  return count;
}

/**
 * Day picker for multi-day events. An empty selection means "all days", but
 * the last chip can't be deselected so the row never silently widens.
 */
function EventDayPicker({
  eventStartAt,
  dayCount,
  selected,
  onChange,
  disabled,
}: {
  eventStartAt: number;
  dayCount: number;
  selected: number[];
  onChange: (dayIndexes: number[]) => void;
  disabled?: boolean;
}) {
  function toggle(dayIndex: number) {
    if (selected.includes(dayIndex)) {
      if (selected.length === 1) {
        notify.error("A band has to play at least one day.");
        return;
      }
      onChange(selected.filter((day) => day !== dayIndex));
    } else {
      onChange([...selected, dayIndex].sort((a, b) => a - b));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {Array.from({ length: dayCount }, (_, dayIndex) => {
        const isSelected = selected.includes(dayIndex);
        return (
          <Button
            key={dayIndex}
            type="button"
            size="sm"
            variant={isSelected ? "default" : "outline"}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => toggle(dayIndex)}
          >
            Day {dayIndex + 1}
            <span className="ml-1.5 font-normal opacity-80">
              {formatDate(addPacificCalendarDays(eventStartAt, dayIndex))}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

function defaultRateForBand(
  bands: Array<{ organizationId: string; performerHourlyRateUsd: number }> | undefined,
  organizationId: string,
) {
  const band = bands?.find((row) => row.organizationId === organizationId);
  if (band?.performerHourlyRateUsd && band.performerHourlyRateUsd > 0) {
    return String(band.performerHourlyRateUsd);
  }
  return "150";
}

export function EventBandPaymentSection({
  eventId,
  eventStartAt,
  eventEndAt,
}: {
  eventId: Id<"events">;
  eventStartAt?: number;
  eventEndAt?: number;
}) {
  return (
    <ArborOnlyGuard>
      <EventBandsPerformersPanel
        eventId={eventId}
        eventStartAt={eventStartAt}
        eventEndAt={eventEndAt}
      />
    </ArborOnlyGuard>
  );
}

function EventBandsPerformersPanel({
  eventId,
  eventStartAt,
  eventEndAt,
}: {
  eventId: Id<"events">;
  eventStartAt?: number;
  eventEndAt?: number;
}) {
  const performers = useQuery(api.eventBands.listPerformersForEvent, { eventId });
  const removeParticipation = useMutation(api.eventBands.removeParticipation);
  const updateRole = useMutation(api.eventBands.updateParticipationRole);
  const setParticipationDays = useMutation(api.eventBands.setParticipationDays);
  const [editingPaymentForOrg, setEditingPaymentForOrg] = useState<string | null>(null);
  const [addingBand, setAddingBand] = useState(false);
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
  const dayCount = getEventDayCount(eventStartAt, eventEndAt);

  const totalBandsCost = useMemo(
    () =>
      (performers ?? []).reduce((sum, row) => sum + (row.payment?.totalUsd ?? 0), 0),
    [performers],
  );

  async function onDaysChange(
    participationId: Id<"eventBandParticipations">,
    organizationId: string,
    dayIndexes: number[],
  ) {
    setBusyOrgId(organizationId);
    try {
      await setParticipationDays({ participationId, dayIndexes });
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusyOrgId(null);
    }
  }

  async function onRemove(organizationId: string) {
    setBusyOrgId(organizationId);
    try {
      await removeParticipation({ eventId, organizationId });
      if (editingPaymentForOrg === organizationId) setEditingPaymentForOrg(null);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusyOrgId(null);
    }
  }

  async function onRoleChange(organizationId: string, role: ParticipationRole) {
    setBusyOrgId(organizationId);
    try {
      await updateRole({ eventId, organizationId, role });
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusyOrgId(null);
    }
  }

  if (performers === undefined) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Loading bands &amp; performers…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Bands &amp; Performers</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign bands to this event (notifies them and unlocks media). Optionally set payout
            details on the same row — removing a band also cancels any unpaid payout and media
            access.
          </p>
        </div>
        {totalBandsCost > 0 ? (
          <p className="text-sm">
            <span className="font-medium">Payout total:</span> {formatUsd(totalBandsCost)}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {performers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bands assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {performers.map((performer) => (
              <div
                key={performer.participationId}
                className="space-y-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{performer.bandName}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <SearchableSelect
                        value={performer.role}
                        onChange={(value) =>
                          void onRoleChange(performer.organizationId, value as ParticipationRole)
                        }
                        options={ROLE_OPTIONS}
                        placeholder="Role"
                        emptyLabel="Role"
                      />
                      {performer.payment ? (
                        <p className="text-muted-foreground">
                          {formatUsd(performer.payment.totalUsd)} · {performer.payment.statusLabel}
                        </p>
                      ) : (
                        <p className="text-muted-foreground">No payout set</p>
                      )}
                    </div>
                    {performer.payment ? (
                      <p className="text-xs text-muted-foreground">
                        Payment ID: {performer.payment.confirmationToken}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {performer.payment?.status !== "paid" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            editingPaymentForOrg === performer.organizationId
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            setEditingPaymentForOrg(
                              editingPaymentForOrg === performer.organizationId
                                ? null
                                : performer.organizationId,
                            )
                          }
                        >
                          {editingPaymentForOrg === performer.organizationId
                            ? "Close"
                            : performer.payment
                              ? "Edit payout"
                              : "Add payout"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyOrgId === performer.organizationId}
                          onClick={() => void onRemove(performer.organizationId)}
                        >
                          Remove
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {roleLabel(performer.role)} · Paid
                      </span>
                    )}
                  </div>
                </div>

                {dayCount > 1 && eventStartAt ? (
                  <div className="space-y-1 border-t pt-2">
                    <Label className="text-xs text-muted-foreground">Plays</Label>
                    <EventDayPicker
                      eventStartAt={eventStartAt}
                      dayCount={dayCount}
                      selected={
                        performer.dayIndexes ??
                        Array.from({ length: dayCount }, (_, dayIndex) => dayIndex)
                      }
                      onChange={(days) =>
                        void onDaysChange(performer.participationId, performer.organizationId, days)
                      }
                      disabled={busyOrgId === performer.organizationId}
                    />
                  </div>
                ) : null}

                {editingPaymentForOrg === performer.organizationId ? (
                  <EventBandPaymentForm
                    key={`${performer.organizationId}-payment`}
                    eventId={eventId}
                    organizationId={performer.organizationId}
                    role={performer.role}
                    payment={performer.payment}
                    organizationLocked
                    excludedOrganizationIds={[]}
                    onSaved={() => setEditingPaymentForOrg(null)}
                    onCancel={() => setEditingPaymentForOrg(null)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}

        {addingBand ? (
          <AddBandForm
            eventId={eventId}
            eventStartAt={eventStartAt}
            dayCount={dayCount}
            excludedOrganizationIds={performers.map((row) => row.organizationId)}
            onSaved={() => setAddingBand(false)}
            onCancel={() => setAddingBand(false)}
          />
        ) : (
          <Button type="button" size="sm" onClick={() => setAddingBand(true)}>
            Add band
          </Button>
        )}

      </CardContent>
    </Card>
  );
}

function AddBandForm({
  eventId,
  eventStartAt,
  dayCount,
  excludedOrganizationIds,
  onSaved,
  onCancel,
}: {
  eventId: Id<"events">;
  eventStartAt?: number;
  dayCount: number;
  excludedOrganizationIds: string[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const bands = useQuery(api.users.listBandOrganizationsAdmin, {});
  const addParticipation = useMutation(api.eventBands.addParticipation);
  const [organizationId, setOrganizationId] = useState("");
  const [role, setRole] = useState<ParticipationRole>("headliner");
  const [busy, setBusy] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>(() =>
    Array.from({ length: Math.max(1, dayCount) }, (_, dayIndex) => dayIndex),
  );

  const bandOptions = useMemo(
    () =>
      (bands ?? [])
        .filter((band) => !excludedOrganizationIds.includes(band.organizationId))
        .map((band) => ({
          value: band.organizationId,
          label: band.displayName || band.name,
        })),
    [bands, excludedOrganizationIds],
  );

  async function onSave() {
    if (!organizationId) {
      notify.error("Select a band or artist.");
      return;
    }
    setBusy(true);
    try {
      await addParticipation({
        eventId,
        organizationId,
        role,
        dayIndexes: selectedDays.length === Math.max(1, dayCount) ? undefined : selectedDays,
      });
      onSaved();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/10 p-4">
      <p className="text-sm font-medium">Add band</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>Band / artist</Label>
          <SearchableSelect
            value={organizationId}
            onChange={setOrganizationId}
            options={bandOptions}
            placeholder="Search bands..."
            emptyLabel="Select band"
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
        {dayCount > 1 && eventStartAt ? (
          <div className="space-y-1 md:col-span-2">
            <Label>Plays</Label>
            <EventDayPicker
              eventStartAt={eventStartAt}
              dayCount={dayCount}
              selected={selectedDays}
              onChange={setSelectedDays}
              disabled={busy}
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void onSave()} disabled={busy}>
          {busy ? "Adding…" : "Assign band"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function EventBandPaymentForm({
  eventId,
  organizationId: lockedOrganizationId,
  role,
  payment,
  organizationLocked,
  excludedOrganizationIds,
  onSaved,
  onCancel,
}: {
  eventId: Id<"events">;
  organizationId?: string;
  role: ParticipationRole;
  payment: PaymentFields | null;
  organizationLocked?: boolean;
  excludedOrganizationIds: string[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const bands = useQuery(api.users.listBandOrganizationsAdmin, {});
  const upsert = useMutation(api.bandPayments.upsertForEvent);

  const [organizationId, setOrganizationId] = useState(lockedOrganizationId ?? "");
  const resolvedOrgId = organizationLocked
    ? (lockedOrganizationId ?? "")
    : organizationId;

  const orgPayee = useQuery(
    api.bandPayments.getBandPayeeForOrganization,
    resolvedOrgId ? { organizationId: resolvedOrgId } : "skip",
  );

  const [pricingMode, setPricingMode] = useState<PricingMode>(
    payment?.pricingMode ?? "per_member_hourly",
  );
  const [ratePerMemberPerHourUsd, setRatePerMemberPerHourUsd] = useState(
    payment
      ? String(payment.ratePerMemberPerHourUsd ?? 0)
      : defaultRateForBand(bands, resolvedOrgId),
  );
  const [performanceHours, setPerformanceHours] = useState(
    String(payment?.performanceHours ?? 1),
  );
  const [memberCount, setMemberCount] = useState(String(payment?.memberCount ?? 4));
  const [fixedTotalUsd, setFixedTotalUsd] = useState(String(payment?.totalUsd ?? 0));
  const [photoAlbumUrl, setPhotoAlbumUrl] = useState(payment?.photoAlbumUrl ?? "");
  const [busy, setBusy] = useState(false);

  const bandOptions = useMemo(
    () =>
      (bands ?? [])
        .filter((band) => !excludedOrganizationIds.includes(band.organizationId))
        .map((band) => ({
          value: band.organizationId,
          label: band.displayName || band.name,
        })),
    [bands, excludedOrganizationIds],
  );

  const computedTotal = useMemo(() => {
    if (pricingMode === "fixed_total") return Number(fixedTotalUsd || "0");
    return (
      Number(ratePerMemberPerHourUsd || "0") *
      Number(performanceHours || "0") *
      Number(memberCount || "0")
    );
  }, [pricingMode, ratePerMemberPerHourUsd, performanceHours, memberCount, fixedTotalUsd]);

  const payeeComplete = orgPayee?.payeeComplete ?? payment?.payeeComplete ?? false;

  async function onSave() {
    if (!resolvedOrgId) {
      notify.error("Select a band or artist.");
      return;
    }
    setBusy(true);
    try {
      await upsert({
        eventId,
        paymentId: payment?._id,
        organizationId: resolvedOrgId,
        role,
        pricingMode,
        ratePerMemberPerHourUsd:
          pricingMode === "per_member_hourly"
            ? Number(ratePerMemberPerHourUsd || "0")
            : undefined,
        performanceHours: Number(performanceHours || "0"),
        memberCount:
          pricingMode === "per_member_hourly" ? Number(memberCount || "0") : undefined,
        totalUsd: pricingMode === "fixed_total" ? Number(fixedTotalUsd || "0") : computedTotal,
        photoAlbumUrl: photoAlbumUrl.trim() || undefined,
      });
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

  return (
    <div className="space-y-4 rounded-md border bg-muted/10 p-4">
      <p className="text-sm font-medium">{payment ? "Edit payout" : "Add payout"}</p>

      {payment ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p>
            <span className="font-medium">Status:</span> {payment.statusLabel}
          </p>
          {payment.eventEnded && payment.status === "draft" ? (
            <p className="text-muted-foreground">
              This event has ended and will enter the payout queue on save.
            </p>
          ) : null}
          {payment.status === "pending_payee" && !payeeComplete ? (
            <p className="text-amber-700 dark:text-amber-300">
              Waiting for the band to configure their designated payee before confirmation can be
              sent.
            </p>
          ) : null}
          {payment.status === "pending_payee" && payeeComplete ? (
            <p className="text-muted-foreground">
              Payee is on file for this band. The payout queue will update automatically, or save
              this payment to refresh it now.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {!organizationLocked ? (
          <div className="space-y-1 md:col-span-2">
            <Label>Band / artist</Label>
            <SearchableSelect
              value={organizationId}
              onChange={(value) => {
                setOrganizationId(value);
                if (!payment) {
                  setRatePerMemberPerHourUsd(defaultRateForBand(bands, value));
                }
              }}
              options={bandOptions}
              placeholder="Search bands..."
              emptyLabel="Select band"
            />
          </div>
        ) : null}

        <div className="space-y-1">
          <Label>Pricing mode</Label>
          <SearchableSelect
            value={pricingMode}
            onChange={(value) => setPricingMode(value as PricingMode)}
            options={PRICING_OPTIONS}
            placeholder="Pricing mode"
            emptyLabel="Select pricing mode"
          />
        </div>

        <div className="space-y-1">
          <Label>Performance length (hours)</Label>
          <Input
            type="number"
            min="0"
            step="0.25"
            value={performanceHours}
            onChange={(e) => setPerformanceHours(e.target.value)}
            disabled={payment?.status === "paid"}
          />
        </div>

        {pricingMode === "per_member_hourly" ? (
          <>
            <div className="space-y-1">
              <Label>Rate per member per hour (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={ratePerMemberPerHourUsd}
                onChange={(e) => setRatePerMemberPerHourUsd(e.target.value)}
                disabled={payment?.status === "paid"}
              />
            </div>
            <div className="space-y-1">
              <Label>Member count</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={memberCount}
                onChange={(e) => setMemberCount(e.target.value)}
                disabled={payment?.status === "paid"}
              />
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <Label>Total payout (USD)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={fixedTotalUsd}
              onChange={(e) => setFixedTotalUsd(e.target.value)}
              disabled={payment?.status === "paid"}
            />
          </div>
        )}

        <div className="rounded-md border px-3 py-2 text-sm md:col-span-2">
          <span className="font-medium">Computed total:</span> {formatUsd(computedTotal)}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Designated payee (from band org profile)</Label>
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
                  This band has not configured a designated payee with mailing address and payout
                  method. Confirmation emails cannot be sent until payee info is on file.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link href="/dashboard/bands-and-performers/payments#payee">
                    Open band payee settings
                  </Link>
                </Button>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Select a band to view payee details.</p>
          )}
        </div>

        <div className="space-y-1 md:col-span-2">
          <Label>Photo album URL (optional override)</Label>
          <Input
            value={photoAlbumUrl}
            onChange={(e) => setPhotoAlbumUrl(e.target.value)}
            placeholder="https://photos.arbor.st/share/..."
            disabled={payment?.status === "paid"}
          />
        </div>
      </div>


      <div className="flex flex-wrap gap-2">
        {payment?.status !== "paid" ? (
          <Button type="button" onClick={() => void onSave()} disabled={busy}>
            {payment ? "Save payout" : "Save payout"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

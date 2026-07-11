"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { formatUsd } from "@/lib/format";

type PricingMode = "per_member_hourly" | "fixed_total";

type BandPaymentRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.bandPayments.listByEvent>>
>[number];

const PRICING_OPTIONS = [
  { value: "per_member_hourly", label: "Per member per hour" },
  { value: "fixed_total", label: "Fixed total" },
];

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

export function EventBandPaymentSection({ eventId }: { eventId: Id<"events"> }) {
  return (
    <ArborOnlyGuard>
      <EventBandPaymentsPanel eventId={eventId} />
    </ArborOnlyGuard>
  );
}

function EventBandPaymentsPanel({ eventId }: { eventId: Id<"events"> }) {
  const payments = useQuery(api.bandPayments.listByEvent, { eventId });
  const cancelPayment = useMutation(api.bandPayments.cancelPayment);
  const [editingId, setEditingId] = useState<Id<"eventBandPayments"> | "new" | null>(null);
  const [busyPaymentId, setBusyPaymentId] = useState<Id<"eventBandPayments"> | null>(null);

  const totalBandsCost = useMemo(
    () => (payments ?? []).reduce((sum, row) => sum + row.totalUsd, 0),
    [payments],
  );

  async function onRemove(paymentId: Id<"eventBandPayments">) {
    setBusyPaymentId(paymentId);
    try {
      await cancelPayment({ paymentId });
      if (editingId === paymentId) setEditingId(null);
    } finally {
      setBusyPaymentId(null);
    }
  }

  if (payments === undefined) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">Loading band payments…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Band &amp; Artist Payments</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Link each performing band and set payout details. After the event, each payment enters the payout queue
            separately.
          </p>
        </div>
        {payments.length > 0 ? (
          <p className="text-sm">
            <span className="font-medium">Event total:</span> {formatUsd(totalBandsCost)}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No performers linked yet.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((payment) => (
              <div
                key={payment._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{payment.bandName}</p>
                  <p className="text-muted-foreground">
                    {formatUsd(payment.totalUsd)} · {payment.statusLabel}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {payment.status !== "paid" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant={editingId === payment._id ? "default" : "outline"}
                        onClick={() =>
                          setEditingId(editingId === payment._id ? null : payment._id)
                        }
                      >
                        {editingId === payment._id ? "Close" : "Edit"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyPaymentId === payment._id}
                        onClick={() => void onRemove(payment._id)}
                      >
                        Remove
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Paid</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {editingId === "new" || editingId === null ? (
          <div className="flex gap-2">
            {editingId !== "new" ? (
              <Button type="button" size="sm" onClick={() => setEditingId("new")}>
                Add performer
              </Button>
            ) : null}
          </div>
        ) : null}

        {editingId === "new" ? (
          <EventBandPaymentForm
            key="new"
            eventId={eventId}
            payment={null}
            excludedOrganizationIds={payments.map((row) => row.organizationId)}
            onSaved={() => setEditingId(null)}
            onCancel={() => setEditingId(null)}
          />
        ) : null}

        {editingId && editingId !== "new" ? (
          <EventBandPaymentForm
            key={editingId}
            eventId={eventId}
            payment={payments.find((row) => row._id === editingId) ?? null}
            excludedOrganizationIds={payments
              .filter((row) => row._id !== editingId)
              .map((row) => row.organizationId)}
            onSaved={() => setEditingId(null)}
            onCancel={() => setEditingId(null)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function EventBandPaymentForm({
  eventId,
  payment,
  excludedOrganizationIds,
  onSaved,
  onCancel,
}: {
  eventId: Id<"events">;
  payment: BandPaymentRow | null;
  excludedOrganizationIds: string[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const bands = useQuery(api.users.listBandOrganizationsAdmin, {});
  const upsert = useMutation(api.bandPayments.upsertForEvent);

  const [organizationId, setOrganizationId] = useState(payment?.organizationId ?? "");
  const orgPayee = useQuery(
    api.bandPayments.getBandPayeeForOrganization,
    organizationId ? { organizationId } : "skip",
  );

  const [pricingMode, setPricingMode] = useState<PricingMode>(payment?.pricingMode ?? "per_member_hourly");
  const [ratePerMemberPerHourUsd, setRatePerMemberPerHourUsd] = useState(
    payment
      ? String(payment.ratePerMemberPerHourUsd ?? 0)
      : defaultRateForBand(bands, organizationId),
  );
  const [performanceHours, setPerformanceHours] = useState(String(payment?.performanceHours ?? 1));
  const [memberCount, setMemberCount] = useState(String(payment?.memberCount ?? 4));
  const [fixedTotalUsd, setFixedTotalUsd] = useState(String(payment?.totalUsd ?? 0));
  const [photoAlbumUrl, setPhotoAlbumUrl] = useState(payment?.photoAlbumUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
    if (!organizationId) {
      setMessage("Select a band or artist.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await upsert({
        eventId,
        paymentId: payment?._id,
        organizationId,
        pricingMode,
        ratePerMemberPerHourUsd:
          pricingMode === "per_member_hourly" ? Number(ratePerMemberPerHourUsd || "0") : undefined,
        performanceHours: Number(performanceHours || "0"),
        memberCount: pricingMode === "per_member_hourly" ? Number(memberCount || "0") : undefined,
        totalUsd: pricingMode === "fixed_total" ? Number(fixedTotalUsd || "0") : computedTotal,
        photoAlbumUrl: photoAlbumUrl.trim() || undefined,
      });
      onSaved();
    } catch (error) {
      setMessage(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const displayPayeeName = payment?.designatedPayeeName ?? orgPayee?.designatedPayeeName ?? "";
  const displayPayeeEmail = payment?.designatedPayeeEmail ?? orgPayee?.designatedPayeeEmail ?? "";
  const displayPayeeAddress =
    payment?.designatedPayeeMailingAddress ?? orgPayee?.designatedPayeeMailingAddress ?? "";

  return (
    <div className="space-y-4 rounded-md border bg-muted/10 p-4">
      <p className="text-sm font-medium">{payment ? "Edit performer payment" : "Add performer payment"}</p>

      {payment ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p>
            <span className="font-medium">Status:</span> {payment.statusLabel}
          </p>
          {payment.eventEnded && payment.status === "draft" ? (
            <p className="text-muted-foreground">This event has ended and will enter the payout queue on save.</p>
          ) : null}
          {payment.status === "pending_payee" && !payeeComplete ? (
            <p className="text-amber-700 dark:text-amber-300">
              Waiting for the band to configure their designated payee before confirmation can be sent.
            </p>
          ) : null}
          {payment.status === "pending_payee" && payeeComplete ? (
            <p className="text-muted-foreground">
              Payee is on file for this band. The payout queue will update automatically, or save this
              payment to refresh it now.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
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
          {organizationId ? (
            payeeComplete ? (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                <p>
                  <span className="font-medium">Payee:</span> {displayPayeeName} ({displayPayeeEmail})
                </p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{displayPayeeAddress}</p>
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-3 py-3 text-sm">
                <p className="text-muted-foreground">
                  This band has not configured a designated payee with mailing address. Confirmation emails cannot
                  be sent until payee info is on file.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link href="/dashboard/bands-and-performers#payment-payee">
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

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <div className="flex flex-wrap gap-2">
        {payment?.status !== "paid" ? (
          <Button type="button" onClick={() => void onSave()} disabled={busy}>
            {payment ? "Save changes" : "Add performer"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

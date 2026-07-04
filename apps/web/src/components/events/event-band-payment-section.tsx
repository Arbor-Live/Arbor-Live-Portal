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

type PricingMode = "per_member_hourly" | "fixed_total";

type BandPaymentRow = NonNullable<ReturnType<typeof useQuery<typeof api.bandPayments.getByEvent>>>;

const PRICING_OPTIONS = [
  { value: "per_member_hourly", label: "Per member per hour" },
  { value: "fixed_total", label: "Fixed total" },
];

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
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

export function EventBandPaymentSection({ eventId }: { eventId: Id<"events"> }) {
  const payment = useQuery(api.bandPayments.getByEvent, { eventId });

  if (payment === undefined) {
    return (
      <ArborOnlyGuard>
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">Loading band payment…</CardContent>
        </Card>
      </ArborOnlyGuard>
    );
  }

  return (
    <ArborOnlyGuard>
      <EventBandPaymentForm key={payment?._id ?? "new"} eventId={eventId} payment={payment} />
    </ArborOnlyGuard>
  );
}

function EventBandPaymentForm({
  eventId,
  payment,
}: {
  eventId: Id<"events">;
  payment: BandPaymentRow | null;
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
      (bands ?? []).map((band) => ({
        value: band.organizationId,
        label: band.displayName || band.name,
      })),
    [bands],
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
      setMessage("Select a band.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await upsert({
        eventId,
        organizationId,
        pricingMode,
        ratePerMemberPerHourUsd:
          pricingMode === "per_member_hourly" ? Number(ratePerMemberPerHourUsd || "0") : undefined,
        performanceHours: Number(performanceHours || "0"),
        memberCount: pricingMode === "per_member_hourly" ? Number(memberCount || "0") : undefined,
        totalUsd: pricingMode === "fixed_total" ? Number(fixedTotalUsd || "0") : computedTotal,
        photoAlbumUrl: photoAlbumUrl.trim() || undefined,
      });
      setMessage("Band payment saved.");
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
    <Card>
      <CardHeader>
        <CardTitle>Band Payment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Link the performing band and set payout details before the event. After the event ends, the payment enters
          the band payout queue for confirmation and GrantEd processing.
        </p>

        {payment ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <p>
              <span className="font-medium">Status:</span> {payment.statusLabel}
            </p>
            {payment.eventEnded && payment.status === "draft" ? (
              <p className="text-muted-foreground">This event has ended and will enter the payout queue on save.</p>
            ) : null}
            {payment.status === "pending_payee" ? (
              <p className="text-amber-700 dark:text-amber-300">
                Waiting for the band to configure their designated payee before confirmation can be sent.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label>Band</Label>
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

        {payment?.status !== "paid" ? (
          <Button type="button" onClick={() => void onSave()} disabled={busy}>
            Save band payment
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

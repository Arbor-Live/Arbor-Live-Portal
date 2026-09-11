"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArtistSelect, artistSelectOptions } from "@/components/bands/artist-select";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { formatUsd } from "@/lib/format";
import { formatBandPayeePayoutMethod } from "@/lib/band-payout-copy";
import { resolvePayoutDefaults } from "@/lib/band-payout-defaults";
import { eventBandOnboardingInviteSchema, eventBandPayoutFieldsSchema } from "@/lib/validations/bands";

type PricingMode = "per_member_hourly" | "fixed_total";
type ParticipationRole = "headliner" | "support" | "other";

type PerformerRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.eventBands.listPerformersForEvent>>
>[number];

type PaymentFields = NonNullable<PerformerRow["payment"]>;

type BandCatalogRow = {
  organizationId: string;
  name?: string;
  displayName?: string;
  performerHourlyRateUsd?: number;
  memberCount?: number;
  bandMembers?: string[];
};

type InvoiceArtistSuggestion = {
  organizationId: string;
  label: string;
  rateUsd?: number;
  performanceHours?: number;
  memberCount?: number;
};

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

function bandProfileDefaults(bands: BandCatalogRow[] | undefined, organizationId: string) {
  const band = bands?.find((row) => row.organizationId === organizationId);
  if (!band) return null;
  const memberCount =
    typeof band.memberCount === "number" && band.memberCount > 0
      ? band.memberCount
      : (band.bandMembers?.length ?? 0);
  return {
    organizationId,
    performerHourlyRateUsd: band.performerHourlyRateUsd ?? 0,
    memberCount,
  };
}

function applyPayoutDefaultsForOrg(
  bands: BandCatalogRow[] | undefined,
  organizationId: string,
  invoiceLine?: InvoiceArtistSuggestion | null,
) {
  return resolvePayoutDefaults({
    invoiceLine: invoiceLine
      ? {
          organizationId: invoiceLine.organizationId,
          rateUsd: invoiceLine.rateUsd,
          performanceHours: invoiceLine.performanceHours,
          memberCount: invoiceLine.memberCount,
        }
      : null,
    bandProfile: bandProfileDefaults(bands, organizationId),
  });
}

export function EventBandPaymentSection({ eventId }: { eventId: Id<"events"> }) {
  return (
    <ArborOnlyGuard>
      <EventBandsPerformersPanel eventId={eventId} />
    </ArborOnlyGuard>
  );
}

function EventBandsPerformersPanel({ eventId }: { eventId: Id<"events"> }) {
  const performers = useQuery(api.eventBands.listPerformersForEvent, { eventId });
  const eventDetail = useQuery(api.events.get, { id: eventId });
  const invoiceId = eventDetail?.event.invoiceId ?? eventDetail?.series?.invoiceId;
  const invoiceDetail = useQuery(
    api.invoices.get,
    invoiceId ? { id: invoiceId } : "skip",
  );
  const removeParticipation = useMutation(api.eventBands.removeParticipation);
  const updateRole = useMutation(api.eventBands.updateParticipationRole);
  const addParticipation = useMutation(api.eventBands.addParticipation);
  const [editingPaymentForOrg, setEditingPaymentForOrg] = useState<string | null>(null);
  const [addingBand, setAddingBand] = useState(false);
  const [addBandMode, setAddBandMode] = useState<"existing" | "invite">("existing");
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [dismissedInvoicePrompt, setDismissedInvoicePrompt] = useState(false);

  const assignedOrgIds = useMemo(
    () => new Set((performers ?? []).map((row) => row.organizationId)),
    [performers],
  );

  const invoiceArtistByOrg = useMemo(() => {
    const map = new Map<string, InvoiceArtistSuggestion>();
    for (const line of invoiceDetail?.lineItems ?? []) {
      if (line.section !== "artist") continue;
      const organizationId = line.organizationId?.trim();
      if (!organizationId || map.has(organizationId)) continue;
      map.set(organizationId, {
        organizationId,
        label: line.label?.trim() || "Artist",
        rateUsd: line.rateUsd,
        performanceHours: line.performanceHours,
        memberCount: line.memberCount,
      });
    }
    return map;
  }, [invoiceDetail?.lineItems]);

  const invoiceArtistSuggestions = useMemo(
    () =>
      [...invoiceArtistByOrg.values()].filter((row) => !assignedOrgIds.has(row.organizationId)),
    [invoiceArtistByOrg, assignedOrgIds],
  );

  const showInvoiceEmptyPrompt =
    !dismissedInvoicePrompt &&
    performers !== undefined &&
    performers.length === 0 &&
    invoiceArtistSuggestions.length > 0;

  const totalBandsCost = useMemo(
    () =>
      (performers ?? []).reduce((sum, row) => sum + (row.payment?.totalUsd ?? 0), 0),
    [performers],
  );

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

  async function onImportFromInvoice() {
    if (invoiceArtistSuggestions.length === 0) return;
    setImportBusy(true);
    try {
      for (const suggestion of invoiceArtistSuggestions) {
        await addParticipation({
          eventId,
          organizationId: suggestion.organizationId,
          role: "headliner",
        });
      }
      notify.success(
        invoiceArtistSuggestions.length === 1
          ? "Imported artist from invoice — confirm payout details."
          : `Imported ${invoiceArtistSuggestions.length} artists from invoice — confirm payout details.`,
      );
      setEditingPaymentForOrg(invoiceArtistSuggestions[0]?.organizationId ?? null);
      setDismissedInvoicePrompt(true);
      setAddingBand(false);
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setImportBusy(false);
    }
  }

  if (performers === undefined) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Loading artists…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Artists</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign artists to this event (notifies them and unlocks media). Optionally set payout
            details on the same row — removing an artist also cancels any unpaid payout and media
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
        {showInvoiceEmptyPrompt ? (
          <div className="space-y-3 rounded-md border bg-muted/20 p-4">
            <p className="text-sm font-medium">
              Invoice lists {invoiceArtistSuggestions.length} artist
              {invoiceArtistSuggestions.length === 1 ? "" : "s"}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {invoiceArtistSuggestions.map((row) => (
                <li key={row.organizationId}>{row.label}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={importBusy}
                onClick={() => void onImportFromInvoice()}
              >
                {importBusy ? "Importing…" : "Accept and confirm money"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={importBusy}
                onClick={() => setDismissedInvoicePrompt(true)}
              >
                Not now
              </Button>
            </div>
          </div>
        ) : null}

        {performers.length === 0 && !showInvoiceEmptyPrompt ? (
          <p className="text-sm text-muted-foreground">No artists assigned yet.</p>
        ) : null}

        {performers.length > 0 ? (
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
                      {performer.awaitingOnboarding ? (
                        <p className="text-amber-700 dark:text-amber-300">Onboarding pending</p>
                      ) : null}
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

                {editingPaymentForOrg === performer.organizationId ? (
                  <EventBandPaymentForm
                    key={`${performer.organizationId}-payment`}
                    eventId={eventId}
                    organizationId={performer.organizationId}
                    role={performer.role}
                    payment={performer.payment}
                    organizationLocked
                    excludedOrganizationIds={[]}
                    invoiceLine={invoiceArtistByOrg.get(performer.organizationId) ?? null}
                    onSaved={() => setEditingPaymentForOrg(null)}
                    onCancel={() => setEditingPaymentForOrg(null)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {addingBand ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={addBandMode === "existing" ? "default" : "outline"}
                onClick={() => setAddBandMode("existing")}
              >
                Existing artist
              </Button>
              <Button
                type="button"
                size="sm"
                variant={addBandMode === "invite" ? "default" : "outline"}
                onClick={() => setAddBandMode("invite")}
              >
                Invite new artist
              </Button>
            </div>
            {addBandMode === "invite" ? (
              <InviteBandForm
                eventId={eventId}
                onSaved={() => setAddingBand(false)}
                onCancel={() => setAddingBand(false)}
              />
            ) : (
              <AddBandForm
                eventId={eventId}
                excludedOrganizationIds={performers.map((row) => row.organizationId)}
                onSaved={() => setAddingBand(false)}
                onCancel={() => setAddingBand(false)}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => {
              setAddBandMode("existing");
              setAddingBand(true);
            }}>
              Add artist
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setAddBandMode("invite");
                setAddingBand(true);
              }}
            >
              Invite new artist
            </Button>
            {invoiceArtistSuggestions.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={importBusy}
                onClick={() => void onImportFromInvoice()}
              >
                Import from invoice ({invoiceArtistSuggestions.length})
              </Button>
            ) : null}
          </div>
        )}

      </CardContent>
    </Card>
  );
}

function InviteBandForm({
  eventId,
  onSaved,
  onCancel,
}: {
  eventId: Id<"events">;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const inviteBand = useMutation(api.eventBands.inviteBandFromEvent);
  const [email, setEmail] = useState("");
  const [artistName, setArtistName] = useState("");
  const [role, setRole] = useState<ParticipationRole>("headliner");
  const [pricingMode, setPricingMode] = useState<PricingMode>("per_member_hourly");
  const [ratePerMemberPerHourUsd, setRatePerMemberPerHourUsd] = useState("150");
  const [performanceHours, setPerformanceHours] = useState("1");
  const [memberCount, setMemberCount] = useState("4");
  const [fixedTotalUsd, setFixedTotalUsd] = useState("0");
  const [busy, setBusy] = useState(false);

  const computedTotal = useMemo(() => {
    if (pricingMode === "fixed_total") return Number(fixedTotalUsd || "0");
    return (
      Number(ratePerMemberPerHourUsd || "0") *
      Number(performanceHours || "0") *
      Number(memberCount || "0")
    );
  }, [pricingMode, ratePerMemberPerHourUsd, performanceHours, memberCount, fixedTotalUsd]);

  async function onSubmit() {
    const parsed = eventBandOnboardingInviteSchema.safeParse({
      email,
      artistName,
      role,
      pricingMode,
      ratePerMemberPerHourUsd,
      performanceHours,
      memberCount,
      fixedTotalUsd,
    });
    if (!parsed.success) {
      notify.error(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setBusy(true);
    try {
      await inviteBand({
        eventId,
        email: parsed.data.email,
        artistName: parsed.data.artistName,
        role: parsed.data.role,
        pricingMode: parsed.data.pricingMode,
        ratePerMemberPerHourUsd:
          parsed.data.pricingMode === "per_member_hourly"
            ? parsed.data.ratePerMemberPerHourUsd
            : undefined,
        performanceHours: parsed.data.performanceHours,
        memberCount:
          parsed.data.pricingMode === "per_member_hourly" ? parsed.data.memberCount : undefined,
        totalUsd:
          parsed.data.pricingMode === "fixed_total" ? parsed.data.fixedTotalUsd : computedTotal,
      });
      notify.success(`Invite sent to ${parsed.data.email}.`);
      onSaved();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/10 p-4">
      <p className="text-sm font-medium">Invite new artist</p>
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
            />
          </div>
        )}
        <div className="rounded-md border px-3 py-2 text-sm md:col-span-2">
          <span className="font-medium">Computed total:</span> {formatUsd(computedTotal)}
        </div>
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

function AddBandForm({
  eventId,
  excludedOrganizationIds,
  onSaved,
  onCancel,
}: {
  eventId: Id<"events">;
  excludedOrganizationIds: string[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const bands = useQuery(api.users.listBandOrganizationsAdmin, {});
  const addParticipation = useMutation(api.eventBands.addParticipation);
  const [organizationId, setOrganizationId] = useState("");
  const [role, setRole] = useState<ParticipationRole>("headliner");
  const [busy, setBusy] = useState(false);

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
      await addParticipation({ eventId, organizationId, role });
      onSaved();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/10 p-4">
      <p className="text-sm font-medium">Add artist</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>Artist</Label>
          <ArtistSelect
            value={organizationId}
            onChange={setOrganizationId}
            options={bandOptions}
            placeholder="Search artists…"
            emptyLabel="Select artist"
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

function EventBandPaymentForm({
  eventId,
  organizationId: lockedOrganizationId,
  role,
  payment,
  organizationLocked,
  excludedOrganizationIds,
  invoiceLine = null,
  onSaved,
  onCancel,
}: {
  eventId: Id<"events">;
  organizationId?: string;
  role: ParticipationRole;
  payment: PaymentFields | null;
  organizationLocked?: boolean;
  excludedOrganizationIds: string[];
  invoiceLine?: InvoiceArtistSuggestion | null;
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

  const seedDefaults = applyPayoutDefaultsForOrg(
    bands as BandCatalogRow[] | undefined,
    lockedOrganizationId ?? "",
    invoiceLine,
  );

  const [pricingMode, setPricingMode] = useState<PricingMode>(
    payment?.pricingMode ?? seedDefaults.pricingMode,
  );
  const [ratePerMemberPerHourUsd, setRatePerMemberPerHourUsd] = useState(
    payment
      ? String(payment.ratePerMemberPerHourUsd ?? 0)
      : seedDefaults.ratePerMemberPerHourUsd,
  );
  const [performanceHours, setPerformanceHours] = useState(
    String(payment?.performanceHours ?? seedDefaults.performanceHours),
  );
  const [memberCount, setMemberCount] = useState(
    String(payment?.memberCount ?? seedDefaults.memberCount),
  );
  const [fixedTotalUsd, setFixedTotalUsd] = useState(String(payment?.totalUsd ?? 0));
  const [photoAlbumUrl, setPhotoAlbumUrl] = useState(payment?.photoAlbumUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [defaultsReadyForOrg, setDefaultsReadyForOrg] = useState(
    Boolean(payment) || !lockedOrganizationId,
  );

  useEffect(() => {
    if (payment || !bands || !resolvedOrgId || defaultsReadyForOrg) return;
    const next = applyPayoutDefaultsForOrg(
      bands as BandCatalogRow[] | undefined,
      resolvedOrgId,
      invoiceLine,
    );
    setPricingMode(next.pricingMode);
    setRatePerMemberPerHourUsd(next.ratePerMemberPerHourUsd);
    setPerformanceHours(next.performanceHours);
    setMemberCount(next.memberCount);
    setDefaultsReadyForOrg(true);
  }, [payment, bands, resolvedOrgId, invoiceLine, defaultsReadyForOrg]);

  const bandOptions = useMemo(
    () => artistSelectOptions(bands, { excludeOrganizationIds: excludedOrganizationIds }),
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
      notify.error("Select an artist.");
      return;
    }
    const payoutParsed = eventBandPayoutFieldsSchema.safeParse({
      pricingMode,
      ratePerMemberPerHourUsd,
      performanceHours,
      memberCount,
      fixedTotalUsd,
    });
    if (!payoutParsed.success) {
      notify.error(payoutParsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setBusy(true);
    try {
      await upsert({
        eventId,
        paymentId: payment?._id,
        organizationId: resolvedOrgId,
        role,
        pricingMode: payoutParsed.data.pricingMode,
        ratePerMemberPerHourUsd:
          payoutParsed.data.pricingMode === "per_member_hourly"
            ? payoutParsed.data.ratePerMemberPerHourUsd
            : undefined,
        performanceHours: payoutParsed.data.performanceHours,
        memberCount:
          payoutParsed.data.pricingMode === "per_member_hourly"
            ? payoutParsed.data.memberCount
            : undefined,
        totalUsd:
          payoutParsed.data.pricingMode === "fixed_total"
            ? payoutParsed.data.fixedTotalUsd
            : computedTotal,
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
          {payment.status === "pending_onboarding" ? (
            <p className="text-amber-700 dark:text-amber-300">
              Waiting for the artist to finish onboarding before payout can proceed.
            </p>
          ) : null}
          {payment.status === "pending_payee" && !payeeComplete ? (
            <p className="text-amber-700 dark:text-amber-300">
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
              onChange={(value) => {
                setOrganizationId(value);
                if (!payment) {
                  const next = applyPayoutDefaultsForOrg(
                    bands as BandCatalogRow[] | undefined,
                    value,
                    invoiceLine?.organizationId === value ? invoiceLine : null,
                  );
                  setPricingMode(next.pricingMode);
                  setRatePerMemberPerHourUsd(next.ratePerMemberPerHourUsd);
                  setPerformanceHours(next.performanceHours);
                  setMemberCount(next.memberCount);
                  setDefaultsReadyForOrg(true);
                }
              }}
              options={bandOptions}
              placeholder="Search artists…"
              emptyLabel="Select artist"
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

        <div className="space-y-1 md:col-span-2">
          <Label>Photo album URL (optional)</Label>
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

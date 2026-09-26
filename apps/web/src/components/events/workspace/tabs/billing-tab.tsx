"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import {
  ArrowSquareOutIcon,
  BuildingsIcon,
  CaretDownIcon,
  ChartLineUpIcon,
  CoinsIcon,
  InfoIcon,
  ReceiptIcon,
  RepeatIcon,
  UsersThreeIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import type { SearchableSelectOption } from "@/components/inventory/searchable-select";
import { EventLinkedInvoicesField } from "@/components/events/event-linked-invoices-field";
import { formatDateTime, formatUsd } from "@/lib/format";
import {
  arborEarnedRevenueUsd,
  eventPassThroughCostUsd,
  invoicePassThroughUsd,
  netProfitCostUsd,
  netProfitFromInvoiceUsd,
} from "@/lib/invoice-profit";
import { cn } from "@/lib/utils";
import type { EventDraft } from "@/components/events/workspace/event-draft";
import { Field } from "@/components/events/workspace/event-fields";
import {
  CoHostsSelect,
  PrimaryHostSelect,
  useHostGroupOptions,
} from "@/components/events/workspace/host-fields";
import { useEventWorkspace } from "@/components/events/workspace/event-workspace-provider";

function formatHours(value: number) {
  return `${value.toFixed(2)}h`;
}

function UsdInput({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        inputMode="decimal"
        className="pl-6 tabular-nums"
        value={value}
        readOnly={readOnly}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div
      className={cn(
        "border px-4 py-3",
        tone === "good" &&
          "border-status-emerald-500/40 bg-status-emerald-500/10 text-status-emerald-700 dark:text-status-emerald-400",
        tone === "bad" &&
          "border-status-rose-500/40 bg-status-rose-500/10 text-status-rose-700 dark:text-status-rose-500",
        tone === "neutral" && "bg-muted/30",
      )}
    >
      <p className={cn("text-xs", tone === "neutral" && "text-muted-foreground")}>{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function BillingTab() {
  const {
    eventId,
    eventData,
    draft,
    updateDraft,
    readOnly,
    canEdit,
    isAdmin,
    seriesMeta,
    linkedInvoice,
    effectivePrimaryHostGroupId,
  } = useEventWorkspace();
  const invoices = useQuery(api.invoices.list, {});
  const hostGroupOptions = useHostGroupOptions();
  const computedCrewCost = useQuery(api.eventCrew.getComputedCrewCost, { eventId });

  const invoiceOptions: SearchableSelectOption[] = useMemo(() => {
    const byId = new Map<string, SearchableSelectOption>();
    for (const row of eventData?.linkedInvoices ?? []) {
      byId.set(row._id, { value: row._id, label: row.invoiceNumber, description: row.clientGroupName });
    }
    for (const row of invoices ?? []) {
      byId.set(row._id, {
        value: row._id,
        label: row.invoiceNumber,
        description: row.clientGroupName ?? row.managerName,
      });
    }
    return [...byId.values()];
  }, [eventData?.linkedInvoices, invoices]);

  const invoicePrimaryHostName =
    linkedInvoice?.clientGroupName ??
    hostGroupOptions.find((option) => option.value === effectivePrimaryHostGroupId)?.label ??
    "";

  const crewCostTotal = computedCrewCost?.totalCostUsd ?? eventData?.event.crewCostUsd ?? 0;
  const bandsCostTotal = Number(draft.bandsCostUsd || "0");
  const externalRentalsCostTotal = Number(draft.externalRentalsCostUsd || "0");
  const otherCostTotal = Number(draft.otherCostUsd || "0");
  const seriesRecurringTotalUsd =
    (seriesMeta?.seriesBandsCostUsd ?? 0) +
    (seriesMeta?.seriesExternalRentalsCostUsd ?? 0) +
    (seriesMeta?.seriesOtherCostUsd ?? 0);
  const totalEventCostUsd = crewCostTotal + bandsCostTotal + externalRentalsCostTotal + otherCostTotal;
  const seriesProjectedCostUsd = seriesMeta?.costSummary?.projectedGrandTotalUsd;
  const marginEventCostUsd =
    seriesMeta && seriesProjectedCostUsd !== undefined
      ? seriesProjectedCostUsd
      : totalEventCostUsd + seriesRecurringTotalUsd;
  const eventPassThroughCostsUsd =
    seriesMeta?.costSummary?.projectedPassThroughUsd !== undefined
      ? seriesMeta.costSummary.projectedPassThroughUsd
      : eventPassThroughCostUsd(bandsCostTotal, externalRentalsCostTotal) +
        (seriesMeta?.seriesBandsCostUsd ?? 0) +
        (seriesMeta?.seriesExternalRentalsCostUsd ?? 0);

  const linkedBilling = useMemo(() => {
    const ids = [
      ...(draft.invoiceId ? [draft.invoiceId] : []),
      ...draft.additionalInvoiceIds.filter((id) => id && id !== draft.invoiceId),
    ];
    if (ids.length === 0) return null;
    let totalUsd = 0;
    let passThroughUsd = 0;
    for (const id of ids) {
      const detail = linkedInvoice?._id === id ? linkedInvoice : null;
      const fromList = (invoices ?? []).find((row) => row._id === id);
      const fromEvent = (eventData?.linkedInvoices ?? []).find((row) => row._id === id);
      const source = detail ?? fromList ?? fromEvent;
      if (!source) return null;
      totalUsd += source.totalUsd;
      passThroughUsd += invoicePassThroughUsd(source.artistsSubtotalUsd, source.externalRentalsSubtotalUsd);
    }
    return { totalUsd, passThroughUsd, count: ids.length };
  }, [draft.additionalInvoiceIds, draft.invoiceId, eventData?.linkedInvoices, invoices, linkedInvoice]);

  const margin = linkedBilling
    ? {
        billedUsd: arborEarnedRevenueUsd(linkedBilling.totalUsd, linkedBilling.passThroughUsd),
        costUsd: netProfitCostUsd(marginEventCostUsd, linkedBilling.passThroughUsd, eventPassThroughCostsUsd),
        profitUsd: netProfitFromInvoiceUsd(
          linkedBilling.totalUsd,
          linkedBilling.passThroughUsd,
          marginEventCostUsd,
          eventPassThroughCostsUsd,
        ),
      }
    : null;
  const hasInvoice = Boolean(draft.invoiceId) || draft.additionalInvoiceIds.length > 0;
  const costLabel = seriesMeta ? "Total series cost (projected)" : "Total event cost";

  function costField(key: keyof Pick<EventDraft, "bandsCostUsd" | "externalRentalsCostUsd" | "otherCostUsd">) {
    return (
      <UsdInput value={draft[key]} onChange={(value) => updateDraft({ [key]: value })} readOnly={readOnly} />
    );
  }

  return (
    <fieldset disabled={readOnly} className="space-y-4">
      {linkedBilling && margin ? (
        <div
          className="grid gap-2 sm:grid-cols-3"
          data-testid="event-linked-invoice-margin"
          aria-label={linkedBilling.count > 1 ? "Linked invoices margin" : "Linked invoice margin"}
        >
          <StatTile label="Total Billed" value={formatUsd(margin.billedUsd)} />
          <StatTile label={costLabel} value={formatUsd(margin.costUsd)} />
          <StatTile
            label="Net profit"
            value={formatUsd(margin.profitUsd)}
            tone={margin.profitUsd >= 0 ? "good" : "bad"}
          />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          <StatTile label={costLabel} value={formatUsd(marginEventCostUsd)} />
          <div className="flex items-start gap-2 border border-dashed px-4 py-3 text-sm text-muted-foreground sm:col-span-2">
            <InfoIcon className="mt-0.5 size-4 shrink-0" />
            {hasInvoice ? (
              <p data-testid="event-linked-invoice-loading">
                Loading the linked invoice — margin appears once it&apos;s available.
              </p>
            ) : (
              <p data-testid="event-linked-invoice-missing">
                No invoice linked. That&apos;s expected for internal events; link one below to track
                billed vs. cost margin.
              </p>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptIcon className="size-4 text-muted-foreground" />
            Invoices &amp; hosts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Linked invoices" icon={ReceiptIcon}>
            <EventLinkedInvoicesField
              primaryInvoiceId={draft.invoiceId}
              additionalInvoiceIds={draft.additionalInvoiceIds}
              options={invoiceOptions}
              onChange={({ primaryInvoiceId, additionalInvoiceIds }) =>
                updateDraft({ invoiceId: primaryInvoiceId, additionalInvoiceIds })
              }
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Primary host" icon={BuildingsIcon}>
              {draft.invoiceId ? (
                <div className="flex h-9 items-center justify-between gap-2 border bg-muted/30 px-3 text-sm">
                  <span className="truncate">{invoicePrimaryHostName || "Set a host on the linked invoice."}</span>
                  <Link
                    href={`/dashboard/financial-hub/invoices/${draft.invoiceId}`}
                    className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Edit on invoice
                    <ArrowSquareOutIcon className="size-3" />
                  </Link>
                </div>
              ) : (
                <PrimaryHostSelect
                  value={draft.hostGroupId}
                  onChange={(hostGroupId) =>
                    updateDraft({
                      hostGroupId,
                      additionalHostGroupIds: draft.additionalHostGroupIds.filter((id) => id !== hostGroupId),
                    })
                  }
                  options={hostGroupOptions}
                  allowCreate={canEdit}
                />
              )}
              {!draft.invoiceId && !draft.hostGroupId && eventData?.event.host ? (
                <p className="text-xs text-muted-foreground">
                  Legacy host: {eventData.event.host}. Pick the matching organization to link it.
                </p>
              ) : null}
            </Field>
            <Field label="Co-hosts" icon={BuildingsIcon}>
              <CoHostsSelect
                values={draft.additionalHostGroupIds}
                onChange={(additionalHostGroupIds) => updateDraft({ additionalHostGroupIds })}
                options={hostGroupOptions}
                primaryHostGroupId={effectivePrimaryHostGroupId}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CoinsIcon className="size-4 text-muted-foreground" />
            Event Costs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {seriesMeta ? (
            <div className="space-y-2 border border-dashed p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <RepeatIcon className="size-4 text-muted-foreground" />
                Recurring series costs
              </p>
              <p className="text-xs text-muted-foreground">
                Per-occurrence template defaults and series-wide costs are managed on the{" "}
                <Link href={`/dashboard/events/series/${seriesMeta._id}`} className="underline">
                  series page
                </Link>
                . Crew cost remains unique to each occurrence.
              </p>
              <div className="grid gap-2 text-sm md:grid-cols-4">
                <p>Template artists / event: {formatUsd(seriesMeta.occurrenceBandsCostUsd ?? 0)}</p>
                <p>Template external / event: {formatUsd(seriesMeta.occurrenceExternalRentalsCostUsd ?? 0)}</p>
                <p>Template other / event: {formatUsd(seriesMeta.occurrenceOtherCostUsd ?? 0)}</p>
                <p>Series-wide recurring: {formatUsd(seriesRecurringTotalUsd)}</p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field
              label="Crew cost"
              icon={UsersThreeIcon}
              hint={
                computedCrewCost
                  ? `${formatHours(computedCrewCost.totalRegularHours)} regular · ${formatHours(computedCrewCost.totalOvertimeHours)} OT`
                  : "Calculating from assigned shifts…"
              }
            >
              <UsdInput value={crewCostTotal.toFixed(2)} readOnly />
            </Field>
            <Field
              label="Artists"
              hint={seriesMeta ? "This occurrence only unless you pick a series scope on save." : undefined}
            >
              {costField("bandsCostUsd")}
            </Field>
            <Field label="External rentals">{costField("externalRentalsCostUsd")}</Field>
            <Field label="Other">{costField("otherCostUsd")}</Field>
          </div>

          <p className="text-xs text-muted-foreground">
            Crew cost is calculated from assigned users in schedule shifts: each uses their hourly rate, and
            hours beyond 8/day are billed at 1.5×
            {computedCrewCost?.otPremium ? " (this event uses whole-event OT premium)." : "."}
            {computedCrewCost?.bufferPercent !== undefined && computedCrewCost.bufferPercent > 0
              ? ` Buffered crew cost (${computedCrewCost.bufferPercent}%): ${formatUsd(
                  computedCrewCost.bufferedTotalCostUsd ?? computedCrewCost.totalCostUsd,
                )}.`
              : null}
          </p>

          {isAdmin ? (
            <div className="grid gap-3 border border-dashed p-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.otPremium}
                  onChange={(e) => updateDraft({ otPremium: e.target.checked })}
                />
                OT premium (whole event 1.5×)
              </label>
              <Field label="Per-event crew buffer %">
                <Input
                  value={draft.crewCostBufferPercent}
                  onChange={(e) => updateDraft({ crewCostBufferPercent: e.target.value })}
                  placeholder="Use global default"
                />
              </Field>
              <p className="text-xs text-muted-foreground md:col-span-2">
                OT premium inflates Stanford input hours (1.5× for hours 1–8) and bills all crew hours at 1.5×
                rate.
              </p>
            </div>
          ) : null}

          {computedCrewCost?.missingRateUsers?.length || computedCrewCost?.missingRateOpenSlotCount ? (
            <div className="flex items-start gap-2 border border-status-amber-500/40 bg-status-amber-500/10 p-2 text-xs text-status-amber-800">
              <WarningIcon className="mt-0.5 size-3.5 shrink-0" weight="fill" />
              <p>
                {computedCrewCost.missingRateUsers?.length ? (
                  <>
                    Missing hourly rates for: {computedCrewCost.missingRateUsers.join(", ")}. These rows are
                    included at $0.00 until a base rate is added.{" "}
                  </>
                ) : null}
                {computedCrewCost.missingRateOpenSlotCount ? (
                  <>
                    {computedCrewCost.missingRateOpenSlotCount} open slot
                    {computedCrewCost.missingRateOpenSlotCount === 1 ? " is" : "s are"} estimated at $0.00
                    because global Normal/Lead crew rates are unset.{" "}
                  </>
                ) : null}
                <Link href="/dashboard/users/crew-rates" className="underline underline-offset-2">
                  Manage crew rates
                </Link>
                .
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {computedCrewCost ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <ChartLineUpIcon className="size-4 text-muted-foreground" />
              Crew cost breakdown
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              OT multiplier {computedCrewCost.overtimeMultiplier.toFixed(2)}×
            </span>
          </CardHeader>
          <CardContent className="space-y-2">
            {computedCrewCost.byScheduleBlock.length === 0 ? (
              <p className="text-sm text-muted-foreground">No schedule-linked crew shifts yet.</p>
            ) : (
              computedCrewCost.byScheduleBlock.map((block, index) => (
                <Collapsible key={block.scheduleBlockId ?? `${block.blockLabel}-${index}`} className="border">
                  <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40">
                    <span className="flex min-w-0 items-center gap-2">
                      <CaretDownIcon className="size-3.5 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {block.blockLabel}
                          {block.blockType ? ` (${block.blockType})` : ""}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Regular {formatHours(block.regularHours)} · OT {formatHours(block.overtimeHours)}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{formatUsd(block.subtotalUsd)}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-x-auto border-t">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30 text-left">
                          <th className="px-3 py-2 font-medium">Crew</th>
                          <th className="px-3 py-2 font-medium">Role</th>
                          <th className="px-3 py-2 font-medium">Shift</th>
                          <th className="px-3 py-2 font-medium">Hours (Reg / OT)</th>
                          <th className="px-3 py-2 font-medium">Rate (Base / OT)</th>
                          <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.rows.map((row) => (
                          <tr key={row.shiftId} className="border-b last:border-b-0">
                            <td className="px-3 py-2">
                              <p>{row.name}</p>
                              {row.missingRate ? (
                                <p className="text-2xs text-status-amber-700">Missing base rate</p>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">{row.role || "—"}</td>
                            <td className="px-3 py-2">
                              {formatDateTime(row.startsAt)} – {formatDateTime(row.endsAt)}
                            </td>
                            <td className="px-3 py-2">
                              {formatHours(row.regularHours)} / {formatHours(row.overtimeHours)}
                            </td>
                            <td className="px-3 py-2">
                              {formatUsd(row.baseRateUsd)} / {formatUsd(row.overtimeRateUsd)}
                            </td>
                            <td className="px-3 py-2 text-right">{formatUsd(row.subtotalUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CollapsibleContent>
                </Collapsible>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </fieldset>
  );
}

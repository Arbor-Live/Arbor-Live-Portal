"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowsClockwiseIcon,
  BuildingsIcon,
  CaretDownIcon,
  CurrencyDollarIcon,
  FilePdfIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { UserSelect } from "@/components/users/user-select";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatContactFullName } from "@/lib/contact-name";
import { formatDateTime, formatUsd } from "@/lib/format";
import { INVOICE_DUE_DAYS_AFTER_EVENT } from "@/lib/invoice-due-date";
import { EQUIPMENT_PRICING_MODE_OPTIONS, INVOICE_GROUP_TYPE_LABELS } from "@/lib/invoice-group-labels";
import { cn } from "@/lib/utils";
import { NewClientDialog, NewHostDialog } from "./invoice-host-dialogs";
import {
  normalizeInvoiceDiscountInput,
  type CrewRateMode,
  type DiscountType,
  type EquipmentPricingModeValue,
} from "./invoice-draft-model";
import type { InvoiceDraft } from "./use-invoice-draft";

function TotalRow({
  label,
  value,
  testId,
  strong,
}: {
  label: React.ReactNode;
  value: string;
  testId?: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn("flex items-baseline justify-between gap-3", strong && "border-t pt-2 text-base font-semibold")}
      data-testid={testId}
    >
      <span className={strong ? undefined : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Subtotal, discount and total, and projected profit when an event is linked. */
function InvoiceTotalCard({ draft }: { draft: InvoiceDraft }) {
  const { draftTotals: totals, fields, setField, invoice, isDraftDirty, profit } = draft;
  const crewHoursQuoted = draft.lines.crewRows.some((row) => Number(row.quantity) > 0);
  return (
    <Card data-testid="invoice-total-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CurrencyDollarIcon className="size-4 text-muted-foreground" aria-hidden />
          {isDraftDirty ? "Draft total" : "Total"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1.5">
          <TotalRow label="Subtotal" value={formatUsd(totals.subtotalUsd)} testId="invoice-total-subtotal" />
          <TotalRow label="Discount" value={`-${formatUsd(totals.discountAmountUsd)}`} testId="invoice-total-discount" />
          <TotalRow label="Total" value={formatUsd(totals.totalUsd)} testId="invoice-total-grand" strong />
        </div>

        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            aria-label="Discount type"
            data-testid="invoice-discount-type"
            value={fields.discountType}
            onValueChange={(value) => {
              if (!value) return;
              const next = value as DiscountType;
              setField("discountType", next);
              setField("discountValue", normalizeInvoiceDiscountInput(fields.discountValue, next));
            }}
          >
            <ToggleGroupItem value="amount" aria-label="Amount">
              $
            </ToggleGroupItem>
            <ToggleGroupItem value="percent" aria-label="Percent">
              %
            </ToggleGroupItem>
          </ToggleGroup>
          <Label htmlFor="invoice-discount-value" className="sr-only">
            Discount
          </Label>
          <Input
            id="invoice-discount-value"
            data-testid="invoice-discount-value"
            className="h-7 text-right tabular-nums"
            inputMode="decimal"
            value={fields.discountValue}
            onChange={(event) => setField("discountValue", event.target.value)}
            onBlur={() =>
              setField("discountValue", normalizeInvoiceDiscountInput(fields.discountValue, fields.discountType))
            }
          />
        </div>

        {draft.pricingUnsaved && isDraftDirty ? (
          <p className="text-xs text-status-amber-700">Pricing differs from last saved total.</p>
        ) : null}
        {totals.discountAmountUsd > totals.equipmentSubtotalUsd || invoice?.discountWarning ? (
          <p className="text-xs text-status-amber-700" data-testid="invoice-discount-warning">
            {invoice?.discountWarning ?? "Discount exceeds equipment rental subtotal."}
          </p>
        ) : null}
        {draft.defaultCrewHourlyRateUsd <= 0 && crewHoursQuoted ? (
          <p className="text-xs text-status-amber-700" data-testid="invoice-crew-rate-warning">
            Crew hours are on the quote but the global crew rate is $0. Set Normal/Lead rates under{" "}
            <Link href="/dashboard/users/crew-rates" className="underline underline-offset-2">
              Users → Crew rates
            </Link>
            .
          </p>
        ) : null}

        {draft.linkedEvent ? (
          <div className="space-y-1.5 border-t pt-3" data-testid="invoice-projected-profit">
            <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">Projected profit</p>
            <TotalRow label="Arbor billed" value={formatUsd(profit.billedUsd)} />
            <TotalRow label="Event cost" value={formatUsd(profit.eventCostUsd)} />
            <div className="flex items-baseline justify-between gap-3 font-medium">
              <span>Net profit</span>
              <span
                className={cn(
                  "tabular-nums",
                  profit.netProfitUsd >= 0 ? "text-status-emerald-700" : "text-status-rose-700",
                )}
              >
                {formatUsd(profit.netProfitUsd)}
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Who the quote is for: host organization, contact, and the contact details printed on it. */
function InvoiceClientCard({ draft }: { draft: InvoiceDraft }) {
  const { alert } = useAppDialog();
  const { fields, setField, groups, contacts } = draft;
  const [hostDialog, setHostDialog] = useState<{ key: number; open: boolean; name: string }>({
    key: 0,
    open: false,
    name: "",
  });
  const [clientDialog, setClientDialog] = useState<{ key: number; open: boolean; name: string }>({
    key: 0,
    open: false,
    name: "",
  });

  const groupOptions = useMemo(
    () =>
      (groups ?? []).map((group) => ({
        value: group._id,
        label: group.name,
        description: INVOICE_GROUP_TYPE_LABELS[group.type] ?? group.type,
        keywords: INVOICE_GROUP_TYPE_LABELS[group.type] ?? group.type,
      })),
    [groups],
  );
  const contactOptions = useMemo(
    () =>
      (contacts ?? []).map((contact) => ({
        value: contact._id,
        label: formatContactFullName(contact.firstName, contact.lastName),
        description: contact.email || undefined,
        keywords: contact.email || undefined,
      })),
    [contacts],
  );
  const selectedGroup = (groups ?? []).find((group) => group._id === fields.groupId);

  async function openNewClient(name: string) {
    if (!fields.groupId) {
      await alert("Select a host first so the client/contact can be linked.");
      return;
    }
    setClientDialog((current) => ({ key: current.key + 1, open: true, name }));
  }

  const detailFields = [
    { key: "clientEmail", label: "Email", type: "email" },
    { key: "clientPhone", label: "Phone", type: "tel" },
    { key: "clientAddressLine1", label: "Address line 1", type: "text" },
    { key: "clientCity", label: "City", type: "text" },
    { key: "clientState", label: "State", type: "text" },
    { key: "clientPostalCode", label: "Postal code", type: "text" },
  ] as const;
  const detailSummary = [fields.clientEmail, fields.clientPhone].filter(Boolean).join(" · ");

  return (
    <Card data-testid="invoice-client-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BuildingsIcon className="size-4 text-muted-foreground" aria-hidden />
          Client
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1.5" data-testid="invoice-host-select">
          <span className="text-xs font-medium">Host</span>
          <SearchableSelect
            value={fields.groupId}
            onChange={draft.onGroupChange}
            options={groupOptions}
            placeholder="Search hosts..."
            emptyLabel="Select host"
            onCreate={(name) => setHostDialog((current) => ({ key: current.key + 1, open: true, name }))}
            createLabel="New Host"
          />
        </div>
        <div className="space-y-1.5" data-testid="invoice-contact-select">
          <span className="text-xs font-medium">Contact</span>
          <SearchableSelect
            value={fields.contactId}
            onChange={draft.onContactChange}
            options={contactOptions}
            placeholder={fields.groupId ? "Search contacts..." : "Select host first"}
            emptyLabel={fields.groupId ? "Select contact" : "Select host first"}
            onCreate={(name) => void openNewClient(name)}
            createLabel="New Client"
          />
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
            >
              <CaretDownIcon className="size-3" aria-hidden />
              <span className="font-medium">Billing details</span>
              <span className="truncate">{detailSummary ? `· ${detailSummary}` : "· email, phone, address"}</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-2 pt-2">
            {detailFields.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`invoice-${field.key}`} className="text-xs text-muted-foreground">
                  {field.label}
                </Label>
                <Input
                  id={`invoice-${field.key}`}
                  type={field.type}
                  placeholder={field.label}
                  value={fields[field.key]}
                  onChange={(event) => setField(field.key, event.target.value)}
                />
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      <NewHostDialog
        key={`host-${hostDialog.key}`}
        open={hostDialog.open}
        onOpenChange={(open) => setHostDialog((current) => ({ ...current, open }))}
        initialName={hostDialog.name}
        onPicked={(groupId) => draft.onGroupChange(groupId)}
      />
      {fields.groupId ? (
        <NewClientDialog
          key={`client-${clientDialog.key}`}
          open={clientDialog.open}
          onOpenChange={(open) => setClientDialog((current) => ({ ...current, open }))}
          initialName={clientDialog.name}
          groupId={fields.groupId as Id<"invoiceGroups">}
          hostName={selectedGroup?.name}
          onCreated={(contactId) => draft.onContactChange(contactId)}
        />
      ) : null}
    </Card>
  );
}

/** Dates, manager, and the pricing modes that set catalog and crew rates. */
function InvoiceDetailsCard({ draft }: { draft: InvoiceDraft }) {
  const { fields, setField, linkedEvent, settings } = draft;
  const canSyncDueDate = linkedEvent?.startAt != null || (linkedEvent?.linkedEvents?.length ?? 0) > 0;
  return (
    <Card data-testid="invoice-details-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontalIcon className="size-4 text-muted-foreground" aria-hidden />
          Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="invoice-issue-date" className="text-xs">
              Issue date
            </Label>
            <Input
              id="invoice-issue-date"
              type="date"
              className="min-w-0"
              value={fields.issueDate}
              onChange={(event) => setField("issueDate", event.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <Label htmlFor="invoice-due-date" className="text-xs">
                Due date
              </Label>
              {canSyncDueDate ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {draft.dueDateTouched ? (
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Sync due date to first event"
                          onClick={() => draft.setDueDateTouched(false)}
                        >
                          <ArrowsClockwiseIcon className="size-3.5" aria-hidden />
                        </button>
                      ) : (
                        <span
                          className="shrink-0 text-muted-foreground"
                          aria-label={`Due date auto-synced to first event plus ${INVOICE_DUE_DAYS_AFTER_EVENT} days`}
                        >
                          <ArrowsClockwiseIcon className="size-3.5" aria-hidden />
                        </span>
                      )}
                    </TooltipTrigger>
                    <TooltipContent>
                      {draft.dueDateTouched ? "Sync to first event" : `Auto · first event + ${INVOICE_DUE_DAYS_AFTER_EVENT}d`}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
            <Input
              id="invoice-due-date"
              type="date"
              className="min-w-0"
              value={fields.dueDate}
              onChange={(event) => {
                setField("dueDate", event.target.value);
                draft.setDueDateTouched(true);
              }}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Manager</span>
          <UserSelect
            value={fields.managerUserId}
            onChange={draft.onManagerChange}
            options={draft.managerOptions}
            placeholder="Search managers..."
            emptyLabel="Select manager"
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium" id="invoice-equipment-pricing">
            Equipment pricing
          </span>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            aria-labelledby="invoice-equipment-pricing"
            className="flex w-full"
            value={fields.equipmentPricingMode}
            onValueChange={(value) => value && setField("equipmentPricingMode", value as EquipmentPricingModeValue)}
          >
            {EQUIPMENT_PRICING_MODE_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium" id="invoice-crew-rate-mode">
            Crew rate for open slots
          </span>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            aria-labelledby="invoice-crew-rate-mode"
            className="flex w-full"
            value={fields.crewRateMode}
            onValueChange={(value) => {
              if (!value) return;
              const next = value as CrewRateMode;
              setField("crewRateMode", next);
              if (next === "custom" && !fields.customCrewRateUsd.trim()) {
                setField("customCrewRateUsd", String(settings?.crewNormalRateUsd ?? 0));
              }
            }}
          >
            <ToggleGroupItem value="normal" className="flex-1">
              Normal
            </ToggleGroupItem>
            <ToggleGroupItem value="lead" className="flex-1">
              Lead
            </ToggleGroupItem>
            <ToggleGroupItem value="custom" className="flex-1">
              Custom
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            Assigned crew bill at their own rate; leads are tagged in the line label.
          </p>
        </div>
        {fields.crewRateMode === "custom" ? (
          <div className="space-y-1.5">
            <Label htmlFor="invoice-custom-crew-rate" className="text-xs">
              Custom hourly rate
            </Label>
            <Input
              id="invoice-custom-crew-rate"
              inputMode="decimal"
              placeholder="0"
              value={fields.customCrewRateUsd}
              onChange={(event) => setField("customCrewRateUsd", event.target.value)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InvoicePdfExports({ invoiceId }: { invoiceId: Id<"invoices"> }) {
  const pdfExports = useQuery(api.invoicePdf.listExports, { invoiceId });
  if (!pdfExports?.length) return null;
  return (
    <Collapsible className="border px-3 py-2 text-sm">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center gap-2 text-left">
          <FilePdfIcon className="size-4 text-muted-foreground" aria-hidden />
          <span className="font-medium">PDF exports</span>
          <span className="text-muted-foreground tabular-nums">{pdfExports.length}</span>
          <CaretDownIcon className="ml-auto size-3.5 text-muted-foreground" aria-hidden />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 pt-2 text-xs break-words text-muted-foreground">
        {pdfExports.slice(0, 5).map((row) => (
          <p key={row._id}>
            {row.fileName} · {formatDateTime(row.createdAt)}
            {row.generatedByName ? ` · ${row.generatedByName}` : ""}
          </p>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The aside: what it costs, who it's for, and the settings behind the prices. */
export function InvoiceSummaryRail({ draft }: { draft: InvoiceDraft }) {
  return (
    <aside className="min-w-0 space-y-4" data-testid="invoice-summary-rail">
      <InvoiceTotalCard draft={draft} />
      <InvoiceClientCard draft={draft} />
      <InvoiceDetailsCard draft={draft} />
      {draft.activeInvoiceId ? <InvoicePdfExports invoiceId={draft.activeInvoiceId} /> : null}
    </aside>
  );
}

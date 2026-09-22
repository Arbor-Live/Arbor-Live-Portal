"use client";

import Link from "next/link";
import { TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/inventory/searchable-select";

/** Matches `MAX_ADDITIONAL_INVOICES_PER_EVENT` in `eventInvoiceLinks.ts`. */
const MAX_ADDITIONAL_INVOICES = 12;

export function EventLinkedInvoicesField({
  primaryInvoiceId,
  additionalInvoiceIds,
  options,
  onChange,
}: {
  primaryInvoiceId: string;
  additionalInvoiceIds: string[];
  options: SearchableSelectOption[];
  onChange: (next: { primaryInvoiceId: string; additionalInvoiceIds: string[] }) => void;
}) {
  const linkedIds = [
    ...(primaryInvoiceId ? [primaryInvoiceId] : []),
    ...additionalInvoiceIds.filter((id) => id && id !== primaryInvoiceId),
  ];
  const optionById = new Map(options.map((option) => [option.value, option]));
  const addOptions = options.filter((option) => option.value && !linkedIds.includes(option.value));
  const showPrimary = linkedIds.length > 1;
  const atAdditionalLimit = additionalInvoiceIds.length >= MAX_ADDITIONAL_INVOICES;

  function addInvoice(invoiceId: string) {
    if (!invoiceId || linkedIds.includes(invoiceId) || atAdditionalLimit) return;
    if (!primaryInvoiceId) {
      onChange({ primaryInvoiceId: invoiceId, additionalInvoiceIds });
      return;
    }
    onChange({
      primaryInvoiceId,
      additionalInvoiceIds: [...additionalInvoiceIds, invoiceId],
    });
  }

  function removeInvoice(invoiceId: string) {
    if (invoiceId === primaryInvoiceId) {
      const [nextPrimary, ...rest] = additionalInvoiceIds;
      onChange({ primaryInvoiceId: nextPrimary ?? "", additionalInvoiceIds: rest });
      return;
    }
    onChange({
      primaryInvoiceId,
      additionalInvoiceIds: additionalInvoiceIds.filter((id) => id !== invoiceId),
    });
  }

  function makePrimary(invoiceId: string) {
    if (!primaryInvoiceId || invoiceId === primaryInvoiceId) return;
    onChange({
      primaryInvoiceId: invoiceId,
      additionalInvoiceIds: [
        primaryInvoiceId,
        ...additionalInvoiceIds.filter((id) => id !== invoiceId),
      ],
    });
  }

  return (
    <div className="space-y-2" data-testid="event-linked-invoices">
      {atAdditionalLimit ? (
        <p className="text-sm text-muted-foreground">Additional invoices max {MAX_ADDITIONAL_INVOICES}.</p>
      ) : (
        <SearchableSelect
          value=""
          onChange={addInvoice}
          options={addOptions}
          placeholder="Search invoices…"
          emptyLabel="Add invoice"
        />
      )}
      {linkedIds.length > 0 ? (
        <ul className="space-y-1">
          {linkedIds.map((invoiceId) => {
            const option = optionById.get(invoiceId);
            const label = option?.label ?? "Invoice";
            const isPrimary = invoiceId === primaryInvoiceId;
            return (
              <li
                key={invoiceId}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2 py-1.5 text-sm"
              >
                <span className="min-w-0 truncate font-medium">{label}</span>
                {option?.description ? (
                  <span className="min-w-0 truncate text-muted-foreground">{option.description}</span>
                ) : null}
                {showPrimary && isPrimary ? (
                  <span className="text-xs text-muted-foreground">Primary</span>
                ) : null}
                <span className="ml-auto flex items-center gap-1">
                  {showPrimary && !isPrimary ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-1"
                      onClick={() => makePrimary(invoiceId)}
                    >
                      Make primary
                    </Button>
                  ) : null}
                  <Button asChild type="button" variant="outline" size="sm">
                    <Link href={`/dashboard/financial-hub/invoices/${invoiceId}`}>Open</Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${label}`}
                    onClick={() => removeInvoice(invoiceId)}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

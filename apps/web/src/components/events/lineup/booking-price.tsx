"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { bookingPriceFieldsSchema } from "@/lib/validations/bands";
import { notify } from "@/lib/notify";

/**
 * A booking's price: the one number the quote bills and the payout pays.
 * Stored on the act's position (`eventArtistNeeds.price`).
 */
export type BookingPrice = {
  pricingMode: "per_member_hourly" | "fixed_total";
  memberCount?: number;
  performanceHours?: number;
  ratePerMemberPerHourUsd?: number;
  totalUsd: number;
};

/** A quote billing the position, and whether it still takes edits from here. */
export type PositionQuote = {
  invoiceId: string;
  invoiceNumber: string;
  locked: "final" | "approved" | null;
};

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** "5 people × 1 hr × $90" for a per-person price; "lump sum" for a lump sum. */
export function describeBookingPrice(
  price: Pick<BookingPrice, "pricingMode" | "memberCount" | "performanceHours" | "ratePerMemberPerHourUsd">,
) {
  if (price.pricingMode !== "per_member_hourly") return "lump sum";
  if (price.memberCount == null || price.performanceHours == null || price.ratePerMemberPerHourUsd == null) {
    return "";
  }
  return `${plural(price.memberCount, "person", "people")} × ${plural(price.performanceHours, "hr", "hrs")} × ${formatUsd(price.ratePerMemberPerHourUsd)}`;
}

/** A price as typed: per person per hour, or one lump sum. */
export type BookingPriceDraft = {
  pricingMode: BookingPrice["pricingMode"];
  memberCount: string;
  performanceHours: string;
  ratePerMemberPerHourUsd: string;
  fixedTotalUsd: string;
};

type Draft = BookingPriceDraft;

function toDraft(price: BookingPrice | null, defaultHours: number | undefined): Draft {
  return {
    pricingMode: price?.pricingMode ?? "per_member_hourly",
    memberCount: String(price?.memberCount ?? 1),
    performanceHours: String(price?.performanceHours ?? defaultHours ?? 1),
    ratePerMemberPerHourUsd: String(price?.ratePerMemberPerHourUsd ?? 0),
    fixedTotalUsd: String(price?.pricingMode === "fixed_total" ? price.totalUsd : 0),
  };
}

export function bookingPriceDraftTotal(draft: BookingPriceDraft) {
  if (draft.pricingMode === "fixed_total") return Number(draft.fixedTotalUsd || "0");
  return (
    Number(draft.memberCount || "0") *
    Number(draft.performanceHours || "0") *
    Number(draft.ratePerMemberPerHourUsd || "0")
  );
}

/**
 * Switch how a price is set without changing what it comes to: a lump sum
 * starts at the per-person total, and back to per person starts as one
 * person for one hour at that sum.
 */
function switchPricingMode(draft: BookingPriceDraft, mode: BookingPrice["pricingMode"]): BookingPriceDraft {
  if (mode === draft.pricingMode) return draft;
  const total = bookingPriceDraftTotal(draft);
  const totalText = String(Number.isFinite(total) ? Number(total.toFixed(2)) : 0);
  return mode === "fixed_total"
    ? { ...draft, pricingMode: mode, fixedTotalUsd: totalText }
    : { ...draft, pricingMode: mode, memberCount: "1", performanceHours: "1", ratePerMemberPerHourUsd: totalText };
}

/**
 * The labeled price fields, shared by the Lineup's Price section and the
 * quote's artist rows: per person per hour (people, hours, rate) or a lump sum.
 */
export function BookingPriceFields({
  value,
  onChange,
  idPrefix,
  className,
}: {
  value: BookingPriceDraft;
  onChange: (next: BookingPriceDraft) => void;
  /** Unique per form on the page, so each label points at its own input. */
  idPrefix: string;
  className?: string;
}) {
  const field = (key: keyof Omit<BookingPriceDraft, "pricingMode">) => ({
    id: `${idPrefix}-${key}`,
    value: value[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: event.target.value }),
  });
  return (
    <div className={cn("flex flex-wrap items-end gap-x-3 gap-y-2", className)}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={value.pricingMode}
        onValueChange={(mode) => {
          if (mode === "per_member_hourly" || mode === "fixed_total") onChange(switchPricingMode(value, mode));
        }}
        aria-label="How the act is priced"
      >
        <ToggleGroupItem value="per_member_hourly">Per person per hour</ToggleGroupItem>
        <ToggleGroupItem value="fixed_total">Lump sum</ToggleGroupItem>
      </ToggleGroup>
      {value.pricingMode === "per_member_hourly" ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-memberCount`}>People</Label>
            <Input {...field("memberCount")} inputMode="numeric" placeholder="People" className="w-20" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-performanceHours`}>Hours</Label>
            <Input {...field("performanceHours")} inputMode="decimal" placeholder="Hours" className="w-20" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-ratePerMemberPerHourUsd`}>Rate / person / hr</Label>
            <Input
              {...field("ratePerMemberPerHourUsd")}
              inputMode="decimal"
              placeholder="Rate / person / hr"
              className="w-28"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-fixedTotalUsd`}>Total (USD)</Label>
          <Input {...field("fixedTotalUsd")} inputMode="decimal" placeholder="Total" className="w-32" />
        </div>
      )}
    </div>
  );
}

/**
 * Edit a booking's price on the Lineup. Saving rebills the quote line that
 * stands for the position and moves the act's unpaid payout. A quote the
 * client approved (or the final invoice) is changed from the quote instead.
 */
export function BookingPriceForm({
  price,
  defaultHours,
  quotes,
  busy,
  onSave,
  onDirtyChange,
}: {
  price: BookingPrice | null;
  /** Hours to start from when there's no price yet (the set's length). */
  defaultHours?: number;
  quotes: PositionQuote[];
  busy: boolean;
  onSave: (price: Omit<BookingPrice, "totalUsd"> & { totalUsd?: number }) => Promise<unknown>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [saved] = useState(() => toDraft(price, defaultHours));
  const [draft, setDraft] = useState(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const locked = quotes.find((quote) => quote.locked);
  const total = bookingPriceDraftTotal(draft);

  async function save() {
    const parsed = bookingPriceFieldsSchema.safeParse(draft);
    if (!parsed.success) {
      notify.error(parsed.error.issues[0]?.message ?? "Check the price and try again.");
      return;
    }
    const value = parsed.data;
    await onSave(
      value.pricingMode === "fixed_total"
        ? { pricingMode: "fixed_total", totalUsd: value.fixedTotalUsd }
        : {
            pricingMode: "per_member_hourly",
            memberCount: value.memberCount,
            performanceHours: value.performanceHours,
            ratePerMemberPerHourUsd: value.ratePerMemberPerHourUsd,
          },
    );
  }

  if (locked) {
    return (
      <div className="space-y-2 text-sm" data-testid="booking-price">
        <p>
          <span className="font-medium tabular-nums">{price ? formatUsd(price.totalUsd) : "Not priced"}</span>
          {price && describeBookingPrice(price) ? (
            <span className="text-muted-foreground"> · {describeBookingPrice(price)}</span>
          ) : null}
        </p>
        <p className="text-muted-foreground">
          {locked.locked === "final"
            ? `${locked.invoiceNumber} is the final invoice. Reopen billing on it to change this price.`
            : `The client approved ${locked.invoiceNumber}. Change the price in the quote, where you can send it back for approval.`}{" "}
          <Link
            href={`/dashboard/ops-center/invoices/${locked.invoiceId}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Open {locked.invoiceNumber}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="booking-price">
      <BookingPriceFields value={draft} onChange={setDraft} idPrefix="booking-price" />
      <p className="text-sm">
        <span className="text-muted-foreground">Total</span>{" "}
        <span className="font-medium tabular-nums" data-testid="booking-price-total">
          {formatUsd(Number.isFinite(total) ? total : 0)}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        {quotes.length > 0
          ? `${quotes.map((quote) => quote.invoiceNumber).join(", ")} bills this price, and the act's payout pays it.`
          : "The act's payout pays this price."}
      </p>
      {dirty ? (
        <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
          Save price
        </Button>
      ) : null}
    </div>
  );
}

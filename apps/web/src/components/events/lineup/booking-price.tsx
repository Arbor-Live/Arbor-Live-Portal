"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatUsd } from "@/lib/format";
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

/** "5 people × 1 hr × $90" for a per-person price; empty for a fixed total. */
export function describeBookingPrice(
  price: Pick<BookingPrice, "pricingMode" | "memberCount" | "performanceHours" | "ratePerMemberPerHourUsd">,
) {
  if (price.pricingMode !== "per_member_hourly") return "fixed total";
  if (price.memberCount == null || price.performanceHours == null || price.ratePerMemberPerHourUsd == null) {
    return "";
  }
  return `${plural(price.memberCount, "person", "people")} × ${plural(price.performanceHours, "hr", "hrs")} × ${formatUsd(price.ratePerMemberPerHourUsd)}`;
}

type Draft = {
  pricingMode: BookingPrice["pricingMode"];
  memberCount: string;
  performanceHours: string;
  ratePerMemberPerHourUsd: string;
  fixedTotalUsd: string;
};

function toDraft(price: BookingPrice | null, defaultHours: number | undefined): Draft {
  return {
    pricingMode: price?.pricingMode ?? "per_member_hourly",
    memberCount: String(price?.memberCount ?? 1),
    performanceHours: String(price?.performanceHours ?? defaultHours ?? 1),
    ratePerMemberPerHourUsd: String(price?.ratePerMemberPerHourUsd ?? 0),
    fixedTotalUsd: String(price?.pricingMode === "fixed_total" ? price.totalUsd : 0),
  };
}

function draftTotal(draft: Draft) {
  if (draft.pricingMode === "fixed_total") return Number(draft.fixedTotalUsd || "0");
  return (
    Number(draft.memberCount || "0") *
    Number(draft.performanceHours || "0") *
    Number(draft.ratePerMemberPerHourUsd || "0")
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
  const total = draftTotal(draft);

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
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={draft.pricingMode}
        onValueChange={(value) => {
          if (value === "per_member_hourly" || value === "fixed_total") setDraft({ ...draft, pricingMode: value });
        }}
        aria-label="How the act is priced"
      >
        <ToggleGroupItem value="per_member_hourly">Per person per hour</ToggleGroupItem>
        <ToggleGroupItem value="fixed_total">Fixed total</ToggleGroupItem>
      </ToggleGroup>
      {draft.pricingMode === "per_member_hourly" ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label htmlFor="booking-price-people">People</Label>
            <Input
              id="booking-price-people"
              inputMode="numeric"
              value={draft.memberCount}
              onChange={(event) => setDraft({ ...draft, memberCount: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="booking-price-hours">Hours</Label>
            <Input
              id="booking-price-hours"
              inputMode="decimal"
              value={draft.performanceHours}
              onChange={(event) => setDraft({ ...draft, performanceHours: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="booking-price-rate">Rate / person / hr</Label>
            <Input
              id="booking-price-rate"
              inputMode="decimal"
              value={draft.ratePerMemberPerHourUsd}
              onChange={(event) => setDraft({ ...draft, ratePerMemberPerHourUsd: event.target.value })}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="booking-price-total">Total (USD)</Label>
          <Input
            id="booking-price-total"
            inputMode="decimal"
            value={draft.fixedTotalUsd}
            onChange={(event) => setDraft({ ...draft, fixedTotalUsd: event.target.value })}
          />
        </div>
      )}
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

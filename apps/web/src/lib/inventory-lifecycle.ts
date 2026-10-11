import type { Tone } from "@/components/page-header";

export type InventoryLifecycle = "active" | "in_repair" | "retired";

export type RetirementReason =
  | "lost"
  | "stolen"
  | "rma"
  | "decommissioned"
  | "beyond_repair"
  | "sold"
  | "donated"
  | "parted_out"
  | "disposed"
  | "duplicate"
  | "other";

export const LIFECYCLE_LABELS: Record<InventoryLifecycle, string> = {
  active: "In service",
  in_repair: "In repair",
  retired: "Retired",
};

export function lifecycleTone(lifecycle: InventoryLifecycle): Tone {
  if (lifecycle === "in_repair") return "amber";
  if (lifecycle === "retired") return "neutral";
  return "emerald";
}

export const LIFECYCLE_OPTIONS = (Object.keys(LIFECYCLE_LABELS) as InventoryLifecycle[]).map((value) => ({
  value,
  label: LIFECYCLE_LABELS[value],
  tone: lifecycleTone(value),
}));

type ReasonInfo = {
  label: string;
  /** One line under the option in the retire dialog. */
  hint: string;
  /** May come back: worth a "found it" path. */
  mayReturn?: boolean;
  /** Asks who took it (buyer, recipient, vendor). */
  counterpartyLabel?: string;
  /** Asks what it sold for. */
  asksAmount?: boolean;
  /** Asks which unit replaced it; required for duplicates. */
  replacementLabel?: string;
  /** A lost case usually means its contents went too. */
  contentsGoToo?: boolean;
};

export const RETIREMENT_REASONS: Record<RetirementReason, ReasonInfo> = {
  lost: { label: "Lost", hint: "Can't find it. Reinstate it if it turns up.", mayReturn: true, contentsGoToo: true },
  stolen: {
    label: "Stolen",
    hint: "Taken. Note the police or insurance reference.",
    mayReturn: true,
    contentsGoToo: true,
  },
  rma: {
    label: "Out for warranty / RMA",
    hint: "With the vendor. Link the unit they sent back, if any.",
    mayReturn: true,
    counterpartyLabel: "Vendor",
    replacementLabel: "Replacement unit",
  },
  decommissioned: { label: "Decommissioned", hint: "Obsolete or at the end of its service life." },
  beyond_repair: { label: "Damaged beyond repair", hint: "Broken and not worth fixing." },
  sold: {
    label: "Sold",
    hint: "Sold on.",
    counterpartyLabel: "Buyer",
    asksAmount: true,
    contentsGoToo: true,
  },
  donated: {
    label: "Donated / transferred",
    hint: "Given away or moved to another department.",
    counterpartyLabel: "Recipient",
    contentsGoToo: true,
  },
  parted_out: { label: "Parted out", hint: "Taken apart for spares." },
  disposed: { label: "Disposed / e-waste", hint: "Thrown out or recycled." },
  duplicate: {
    label: "Duplicate record",
    hint: "The same unit was entered twice. Pick the record to keep.",
    replacementLabel: "The record to keep",
  },
  other: { label: "Other", hint: "Say why in the note." },
};

export const RETIREMENT_REASON_ORDER = Object.keys(RETIREMENT_REASONS) as RetirementReason[];

export function retirementLabel(reason: RetirementReason | undefined) {
  return reason ? RETIREMENT_REASONS[reason].label : "Retired";
}

/** "In repair", "Retired · Lost", or null while in service. */
export function lifecycleSummary(lifecycle: InventoryLifecycle, reason?: RetirementReason): string | null {
  if (lifecycle === "retired") return `Retired · ${retirementLabel(reason)}`;
  if (lifecycle === "in_repair") return LIFECYCLE_LABELS.in_repair;
  return null;
}

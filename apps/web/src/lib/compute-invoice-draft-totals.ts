export type EquipmentQuantityBasis = "total" | "per_occurrence";

export type DraftEquipmentRow = {
  refId: string;
  quantity: string;
  basis?: EquipmentQuantityBasis;
};

export type DraftLineItem = {
  section:
    | "equipment_package"
    | "equipment_type"
    | "external_rental"
    | "artist"
    | "crew"
    | "fee";
  quantity: number;
  rateUsd: number;
  equipmentQuantityBasis?: EquipmentQuantityBasis;
  packageId?: string;
  typeId?: string;
  excludedTypeIds?: string[];
  packageExclusionDiscountUsd?: number;
};

export type DraftPackageItem = {
  typeId: string;
  quantity: number;
  type?: {
    subsidizedRentalPriceUsd?: number;
    nonSubsidizedRentalPriceUsd?: number;
    rentalPriceUsd?: number;
  } | null;
};

export type ComputeInvoiceDraftTotalsInput = {
  equipmentPricingMode: "subsidized" | "nonSubsidized";
  discountType: "amount" | "percent";
  discountValue: number;
  billableOccurrenceCount: number;
  packages: Array<{
    _id: string;
    subsidizedPackagePriceUsd?: number;
    nonSubsidizedPackagePriceUsd?: number;
    packagePriceCents: number;
    items?: DraftPackageItem[];
  }>;
  types: Array<{
    _id: string;
    subsidizedRentalPriceUsd?: number;
    nonSubsidizedRentalPriceUsd?: number;
    rentalPriceUsd?: number;
  }>;
  lineItems: DraftLineItem[];
};

export type InvoiceDraftTotals = {
  equipmentSubtotalUsd: number;
  externalRentalsSubtotalUsd: number;
  artistsSubtotalUsd: number;
  crewSubtotalUsd: number;
  feesSubtotalUsd: number;
  subtotalUsd: number;
  discountAmountUsd: number;
  totalUsd: number;
};

function packageRate(
  pkg: ComputeInvoiceDraftTotalsInput["packages"][number],
  mode: "subsidized" | "nonSubsidized",
) {
  if (mode === "subsidized") {
    return pkg.subsidizedPackagePriceUsd ?? pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100;
  }
  return pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100;
}

function typeRate(
  type: ComputeInvoiceDraftTotalsInput["types"][number],
  mode: "subsidized" | "nonSubsidized",
) {
  if (mode === "subsidized") {
    return type.subsidizedRentalPriceUsd ?? type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0;
  }
  return type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0;
}

function itemTypeRate(
  type: DraftPackageItem["type"],
  mode: "subsidized" | "nonSubsidized",
) {
  if (!type) return 0;
  if (mode === "subsidized") {
    return type.subsidizedRentalPriceUsd ?? type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0;
  }
  return type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0;
}

/** Sum of (excluded BOM type qty × current type rental rate); mirrors the backend suggestion. */
export function computePackageExclusionSuggestedDiscount(
  items: DraftPackageItem[] | undefined,
  excludedTypeIds: string[] | undefined,
  mode: "subsidized" | "nonSubsidized",
): number {
  if (!items?.length || !excludedTypeIds?.length) return 0;
  const excluded = new Set(excludedTypeIds);
  let total = 0;
  for (const item of items) {
    if (!excluded.has(item.typeId)) continue;
    total += item.quantity * itemTypeRate(item.type, mode);
  }
  return Number(total.toFixed(2));
}

function billingQuantity(
  quantity: number,
  section: DraftLineItem["section"],
  basis: EquipmentQuantityBasis | undefined,
  billableOccurrenceCount: number,
) {
  if (
    (section === "equipment_package" || section === "equipment_type") &&
    basis === "per_occurrence" &&
    billableOccurrenceCount > 0
  ) {
    return quantity * billableOccurrenceCount;
  }
  return quantity;
}

export function computeInvoiceDraftTotals(input: ComputeInvoiceDraftTotalsInput): InvoiceDraftTotals {
  let equipmentSubtotalUsd = 0;
  let externalRentalsSubtotalUsd = 0;
  let artistsSubtotalUsd = 0;
  let crewSubtotalUsd = 0;
  let feesSubtotalUsd = 0;

  for (const line of input.lineItems) {
    let rate = line.rateUsd;
    if (line.section === "equipment_package") {
      const pkg = input.packages.find((row) => row._id === line.packageId);
      if (pkg) {
        const originalRate = packageRate(pkg, input.equipmentPricingMode);
        const suggestedDiscount = computePackageExclusionSuggestedDiscount(
          pkg.items,
          line.excludedTypeIds,
          input.equipmentPricingMode,
        );
        const discount = line.packageExclusionDiscountUsd ?? suggestedDiscount;
        rate = Math.max(0, originalRate - Math.max(0, discount));
      }
    }
    if (line.section === "equipment_type") {
      const type = input.types.find((row) => row._id === line.typeId);
      if (type) rate = typeRate(type, input.equipmentPricingMode);
    }

    const qty = billingQuantity(
      line.quantity,
      line.section,
      line.equipmentQuantityBasis,
      input.billableOccurrenceCount,
    );
    const amount = qty * Math.max(0, rate);

    if (line.section === "equipment_package" || line.section === "equipment_type") {
      equipmentSubtotalUsd += amount;
    } else if (line.section === "external_rental") {
      externalRentalsSubtotalUsd += amount;
    } else if (line.section === "artist") {
      artistsSubtotalUsd += amount;
    } else if (line.section === "crew") {
      crewSubtotalUsd += amount;
    } else if (line.section === "fee") {
      feesSubtotalUsd += amount;
    }
  }

  const subtotalUsd =
    equipmentSubtotalUsd +
    externalRentalsSubtotalUsd +
    artistsSubtotalUsd +
    crewSubtotalUsd +
    feesSubtotalUsd;
  const discountAmountUsd =
    input.discountType === "percent"
      ? subtotalUsd * Math.max(0, input.discountValue) / 100
      : Math.max(0, input.discountValue);
  const totalUsd = Math.max(0, subtotalUsd - discountAmountUsd);

  const round = (value: number) => Number(value.toFixed(2));

  return {
    equipmentSubtotalUsd: round(equipmentSubtotalUsd),
    externalRentalsSubtotalUsd: round(externalRentalsSubtotalUsd),
    artistsSubtotalUsd: round(artistsSubtotalUsd),
    crewSubtotalUsd: round(crewSubtotalUsd),
    feesSubtotalUsd: round(feesSubtotalUsd),
    subtotalUsd: round(subtotalUsd),
    discountAmountUsd: round(discountAmountUsd),
    totalUsd: round(totalUsd),
  };
}

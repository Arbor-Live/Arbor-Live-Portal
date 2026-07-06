export type EquipmentQuantityBasis = "total" | "per_occurrence";

export function equipmentDivisionWarnings(args: {
  billableOccurrenceCount: number;
  packages: Array<{ label: string; quantity: number; basis?: EquipmentQuantityBasis }>;
  types: Array<{ label: string; quantity: number; basis?: EquipmentQuantityBasis }>;
}): string[] {
  if (args.billableOccurrenceCount <= 1) return [];
  const warnings: string[] = [];
  const check = (label: string, quantity: number, basis?: EquipmentQuantityBasis) => {
    if (basis === "per_occurrence" || quantity <= 0) return;
    const remainder = quantity % args.billableOccurrenceCount;
    if (remainder > 0) {
      warnings.push(
        `${label}: quantity ${quantity} leaves ${remainder} extra when split across ${args.billableOccurrenceCount} occurrences.`,
      );
    }
  };
  for (const row of args.packages) check(row.label, row.quantity, row.basis);
  for (const row of args.types) check(row.label, row.quantity, row.basis);
  return warnings;
}

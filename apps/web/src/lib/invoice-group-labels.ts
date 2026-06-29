export const INVOICE_GROUP_TYPE_LABELS: Record<string, string> = {
  vso: "VSO",
  house: "House",
  department: "Department",
  individual: "Individual",
};

export const INVOICE_GROUP_TYPE_OPTIONS = [
  { value: "vso", label: "VSO" },
  { value: "house", label: "House" },
  { value: "department", label: "Department" },
  { value: "individual", label: "Individual" },
] as const;

export type EquipmentPricingMode = "subsidized" | "nonSubsidized";

export const EQUIPMENT_PRICING_MODE_LABELS: Record<EquipmentPricingMode, string> = {
  subsidized: "Subsidized",
  nonSubsidized: "Non-subsidized",
};

export const EQUIPMENT_PRICING_MODE_OPTIONS = [
  { value: "subsidized" as const, label: "Subsidized" },
  { value: "nonSubsidized" as const, label: "Non-subsidized" },
];

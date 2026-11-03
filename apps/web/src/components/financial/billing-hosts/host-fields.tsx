"use client";

import { TextFormField } from "@/components/forms/text-form-field";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UseConvexFormReturn } from "@/hooks/use-convex-form";
import {
  EQUIPMENT_PRICING_MODE_OPTIONS,
  INVOICE_GROUP_TYPE_OPTIONS,
  type EquipmentPricingMode,
} from "@/lib/invoice-group-labels";
import type { InvoiceGroupFormValues } from "@/lib/validations/financial";

export const NEW_HOST_DEFAULTS: InvoiceGroupFormValues = {
  name: "",
  type: "vso",
  equipmentPricingMode: "subsidized",
};

/** Name, type and equipment pricing for a host. Render inside the form's `<Form>`. */
export function HostFields({
  form,
  idPrefix,
  autoFocus,
}: {
  form: UseConvexFormReturn<InvoiceGroupFormValues>;
  /** Distinct per form, so two forms on screen don't share label ids. */
  idPrefix: string;
  autoFocus?: boolean;
}) {
  return (
    <>
      <TextFormField name="name" label="Name" autoFocus={autoFocus} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-type`}>Type</Label>
          <Select
            value={form.watch("type")}
            onValueChange={(value) =>
              form.setValue("type", value as InvoiceGroupFormValues["type"], { shouldDirty: true })
            }
          >
            <SelectTrigger id={`${idPrefix}-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVOICE_GROUP_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-pricing`}>Equipment pricing</Label>
          <Select
            value={form.watch("equipmentPricingMode")}
            onValueChange={(value) =>
              form.setValue("equipmentPricingMode", value as EquipmentPricingMode, { shouldDirty: true })
            }
          >
            <SelectTrigger id={`${idPrefix}-pricing`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EQUIPMENT_PRICING_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}

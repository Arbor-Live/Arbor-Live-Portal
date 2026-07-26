import { z } from "zod";

export const managerProfileSchema = z.object({
  title: z.string().optional(),
  phone: z.string().optional(),
});

export type ManagerProfileFormValues = z.infer<typeof managerProfileSchema>;

export const invoiceGroupTypeSchema = z.enum(["vso", "house", "department", "individual"]);

export const equipmentPricingModeSchema = z.enum(["subsidized", "nonSubsidized"]);

export const invoiceGroupSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  type: invoiceGroupTypeSchema,
  equipmentPricingMode: equipmentPricingModeSchema,
});

export type InvoiceGroupFormValues = z.infer<typeof invoiceGroupSchema>;

export const invoiceContactSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email").or(z.literal("")),
  phone: z.string().optional(),
});

export type InvoiceContactFormValues = z.infer<typeof invoiceContactSchema>;

export const feeDefinitionSchema = z.object({
  key: z.string().min(1, "Key is required"),
  label: z.string().min(1, "Label is required"),
  defaultAmountUsd: z.coerce.number().min(0, "Amount must be non-negative"),
});

export type FeeDefinitionFormValues = z.infer<typeof feeDefinitionSchema>;

export const termsDefinitionSchema = z.object({
  label: z.string().min(1, "Label is required"),
  version: z.string().min(1, "Version is required"),
  markdown: z.string().min(1, "Terms content is required"),
});

export type TermsDefinitionFormValues = z.infer<typeof termsDefinitionSchema>;

export const userRateSchema = z
  .object({
    rateMode: z.enum(["normal", "lead", "custom"]),
    hourlyRateUsd: z.coerce.number().min(0, "Rate must be non-negative"),
  })
  .superRefine((values, ctx) => {
    if (values.rateMode === "custom" && values.hourlyRateUsd < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom rate must be non-negative",
        path: ["hourlyRateUsd"],
      });
    }
  });

export type UserRateFormValues = z.infer<typeof userRateSchema>;

export const globalCrewRatesSchema = z.object({
  defaultCrewRateUsd: z.coerce.number().min(0, "Rate must be non-negative"),
  defaultLeadRateUsd: z.coerce.number().min(0, "Rate must be non-negative"),
});

export type GlobalCrewRatesFormValues = z.infer<typeof globalCrewRatesSchema>;

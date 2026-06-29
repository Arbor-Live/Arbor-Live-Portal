import { z } from "zod";

export const eventOverviewSchema = z.object({
  title: z.string().min(1, "Title is required"),
  status: z.string().min(1),
  startAt: z.string().min(1, "Start is required"),
  endAt: z.string().min(1, "End is required"),
  venueName: z.string().optional(),
  eventType: z.string().optional(),
  notes: z.string().optional(),
});

export type EventOverviewFormValues = z.infer<typeof eventOverviewSchema>;

export const invoiceDraftRowSchema = z.object({
  refId: z.string(),
  quantity: z.string(),
});

export const invoiceDraftSchema = z.object({
  issueDate: z.string().min(1, "Issue date is required"),
  dueDate: z.string().optional(),
  managerUserId: z.string().min(1, "Manager is required"),
  groupId: z.string().optional(),
  contactId: z.string().optional(),
  clientEmail: z.string().optional(),
  notes: z.string().optional(),
  discountValue: z.coerce.number().min(0),
  equipmentPackages: z.array(invoiceDraftRowSchema),
  equipmentTypes: z.array(invoiceDraftRowSchema),
});

export type InvoiceDraftFormValues = z.infer<typeof invoiceDraftSchema>;

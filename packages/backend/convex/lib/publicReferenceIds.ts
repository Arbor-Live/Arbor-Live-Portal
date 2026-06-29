import { customAlphabet } from "nanoid";
import type { MutationCtx } from "../_generated/server";

export const INVOICE_REFERENCE_PREFIX = "ALINV-";
export const REQUEST_REFERENCE_PREFIX = "ALREQ-";

const REFERENCE_SUFFIX_LENGTH = 7;
const referenceSuffix = customAlphabet(
  "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ",
  REFERENCE_SUFFIX_LENGTH,
);

export function formatInvoiceReferenceId() {
  return `${INVOICE_REFERENCE_PREFIX}${referenceSuffix()}`;
}

export function formatRequestReferenceId() {
  return `${REQUEST_REFERENCE_PREFIX}${referenceSuffix()}`;
}

export function isInvoiceReferenceId(value: string) {
  return value.startsWith(INVOICE_REFERENCE_PREFIX);
}

export function isRequestReferenceId(value: string | undefined) {
  return Boolean(value?.startsWith(REQUEST_REFERENCE_PREFIX));
}

async function allocateUniqueInvoiceReferenceId(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = formatInvoiceReferenceId();
    const existing = await ctx.db
      .query("invoices")
      .withIndex("by_invoiceNumber", (q) => q.eq("invoiceNumber", candidate))
      .unique();
    if (!existing) return candidate;
  }
  throw new Error("Unable to allocate invoice reference id.");
}

async function allocateUniqueRequestReferenceId(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = formatRequestReferenceId();
    const existing = await ctx.db
      .query("eventRequests")
      .withIndex("by_requestNumber", (q) => q.eq("requestNumber", candidate))
      .unique();
    if (!existing) return candidate;
  }
  throw new Error("Unable to allocate request reference id.");
}

export async function allocateInvoiceNumber(ctx: MutationCtx) {
  return await allocateUniqueInvoiceReferenceId(ctx);
}

export async function allocateRequestNumber(ctx: MutationCtx) {
  return await allocateUniqueRequestReferenceId(ctx);
}

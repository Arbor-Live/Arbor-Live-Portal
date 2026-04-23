import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listExports = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("invoiceExports")
      .withIndex("by_invoiceId_and_createdAt", (q) => q.eq("invoiceId", args.invoiceId))
      .take(50);
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const createExportRecord = mutation({
  args: {
    invoiceId: v.id("invoices"),
    generatedByUserId: v.string(),
    generatedByName: v.optional(v.string()),
    fileName: v.string(),
    downloadUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found.");
    return await ctx.db.insert("invoiceExports", {
      invoiceId: args.invoiceId,
      format: "pdf",
      generatedByUserId: args.generatedByUserId,
      generatedByName: args.generatedByName?.trim() || undefined,
      fileName: args.fileName.trim(),
      downloadUrl: args.downloadUrl?.trim() || undefined,
      createdAt: Date.now(),
    });
  },
});

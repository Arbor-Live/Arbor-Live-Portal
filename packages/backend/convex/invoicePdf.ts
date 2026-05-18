import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserId, requireAuth } from "./lib/auth";

export const listExports = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
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
    fileName: v.string(),
    downloadUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found.");
    return await ctx.db.insert("invoiceExports", {
      invoiceId: args.invoiceId,
      format: "pdf",
      generatedByUserId: getUserId(user),
      generatedByName: user.name?.trim() || user.email || undefined,
      fileName: args.fileName.trim(),
      downloadUrl: args.downloadUrl?.trim() || undefined,
      createdAt: Date.now(),
    });
  },
});

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const resolvePublicInvoiceId = internalQuery({
  args: {
    token: v.string(),
    portal: v.union(v.literal("quote"), v.literal("request")),
  },
  returns: v.union(v.id("invoices"), v.null()),
  handler: async (ctx, args) => {
    if (args.portal === "quote") {
      const invoice = await ctx.db
        .query("invoices")
        .withIndex("by_publicApprovalToken", (q) => q.eq("publicApprovalToken", args.token))
        .unique();
      if (!invoice || invoice.status === "void" || invoice.sourceEventRequestId) return null;
      return invoice._id;
    }

    const request = await ctx.db
      .query("eventRequests")
      .withIndex("by_publicToken", (q) => q.eq("publicToken", args.token))
      .unique();
    if (!request?.linkedInvoiceId) return null;
    const invoice = await ctx.db.get(request.linkedInvoiceId);
    if (!invoice || invoice.status === "void" || !invoice.clientReviewReadyAt) return null;
    return invoice._id;
  },
});

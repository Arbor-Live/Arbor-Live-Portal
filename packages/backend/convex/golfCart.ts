import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireArborInternalContext, requirePortalAdmin } from "./lib/auth";
import { normalizeAlertRecipients } from "./lib/alertRecipients";

/**
 * Ops Center → Settings: who is emailed when a cart event goes Ready. Starts
 * empty, and portal admins are not included unless someone adds them.
 */
export const getGolfCartSettings = query({
  args: {},
  returns: v.object({ alertRecipients: v.array(v.string()) }),
  handler: async (ctx) => {
    await requirePortalAdmin(ctx);
    await requireArborInternalContext(ctx);
    const row = await ctx.db.query("golfCartSettings").first();
    return { alertRecipients: row?.alertRecipients ?? [] };
  },
});

export const updateGolfCartSettings = mutation({
  args: { alertRecipients: v.array(v.string()) },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await requirePortalAdmin(ctx);
    await requireArborInternalContext(ctx);
    const alertRecipients = normalizeAlertRecipients(args.alertRecipients);

    const existing = await ctx.db.query("golfCartSettings").first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { alertRecipients, updatedAt: now });
    } else {
      await ctx.db.insert("golfCartSettings", { alertRecipients, updatedAt: now });
    }
    return { ok: true as const };
  },
});

"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";

export const trigger = internalAction({
  args: {
    paths: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const secret = process.env.REVALIDATE_SECRET;
    const siteUrl = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
    if (!secret || !siteUrl) {
      console.warn("Skipping site revalidation: REVALIDATE_SECRET or SITE_URL is not set.");
      return null;
    }

    const response = await fetch(`${siteUrl.replace(/\/$/, "")}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        paths: args.paths,
      }),
    });

    if (!response.ok) {
      console.error(
        "Site revalidation failed",
        response.status,
        await response.text().catch(() => ""),
      );
    }

    return null;
  },
});

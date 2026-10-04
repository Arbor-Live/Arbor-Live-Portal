"use node";

import webpush from "web-push";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

function vapidDetails() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:arborlive@stanford.edu";
  return { subject, publicKey, privateKey };
}

/** Send one notification to every push device its recipient registered. */
export const sendPushForNotification = internalAction({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const vapid = vapidDetails();
    if (!vapid) return null;
    const delivery = await ctx.runQuery(internal.pushSubscriptions.getPushDelivery, args);
    if (!delivery) return null;

    // Read by `public/sw.js`.
    const payload = JSON.stringify({
      title: delivery.title,
      body: delivery.body,
      path: delivery.path ?? "/dashboard",
      tag: args.notificationId,
      unreadCount: delivery.unreadCount,
    });
    const expired: string[] = [];
    await Promise.all(
      delivery.subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            { vapidDetails: vapid, TTL: 24 * 60 * 60, urgency: "normal" },
          );
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            expired.push(subscription.endpoint);
          } else {
            console.error("[push] send failed", status, (error as Error).message);
          }
        }
      }),
    );
    if (expired.length > 0) {
      await ctx.runMutation(internal.pushSubscriptions.removeExpiredSubscriptions, {
        endpoints: expired,
      });
    }
    return null;
  },
});

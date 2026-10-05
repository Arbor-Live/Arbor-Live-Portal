"use client";

import { useCallback, useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { usePushEnvironment } from "@/hooks/use-pwa";
import {
  normalizeBase64Url,
  registerServiceWorker,
  subscriptionServerKey,
  urlBase64ToUint8Array,
} from "@/lib/pwa";

export type PushState =
  | "loading"
  /** No Web Push in this browser. */
  | "unsupported"
  /** iOS only allows push from the Home Screen app. */
  | "needs-install"
  /** The deployment has no VAPID keys. */
  | "unconfigured"
  | "denied"
  | "off"
  | "on";

/** This device's push status for the signed-in user, plus on/off actions. */
export function usePushSubscription() {
  const { isAuthenticated } = useConvexAuth();
  const config = useQuery(api.pushSubscriptions.getPushConfig, isAuthenticated ? {} : "skip");
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);
  const [subscriptionKey, setSubscriptionKey] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const registered = useQuery(
    api.pushSubscriptions.isSubscribed,
    endpoint ? { endpoint } : "skip",
  );
  const subscribe = useMutation(api.pushSubscriptions.subscribe);
  const unsubscribe = useMutation(api.pushSubscriptions.unsubscribe);
  const environment = usePushEnvironment();

  useEffect(() => {
    if (environment !== "ok") return;
    let cancelled = false;
    void registerServiceWorker()
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (cancelled) return;
        setPermission(Notification.permission);
        setEndpoint(subscription?.endpoint ?? null);
        setSubscriptionKey(subscription ? subscriptionServerKey(subscription) : null);
      })
      .catch(() => {
        if (!cancelled) setEndpoint(null);
      });
    return () => {
      cancelled = true;
    };
  }, [environment]);

  let state: PushState;
  if (environment === "pending") state = "loading";
  else if (environment !== "ok") state = environment;
  else if (config === undefined || endpoint === undefined || permission === null) state = "loading";
  else if (!config.vapidPublicKey) state = "unconfigured";
  else if (permission === "denied") state = "denied";
  else if (endpoint && registered === undefined) state = "loading";
  else {
    // A subscription made with a rotated-out key can't receive pushes: show
    // "off" so "Turn on" renews it.
    const staleKey = Boolean(
      subscriptionKey && subscriptionKey !== normalizeBase64Url(config.vapidPublicKey),
    );
    state = endpoint && registered && permission === "granted" && !staleKey ? "on" : "off";
  }

  const vapidPublicKey = config?.vapidPublicKey ?? null;

  /** Must run from a click: iOS only shows the permission prompt on a user gesture. */
  const enable = useCallback(async () => {
    if (!vapidPublicKey) throw new Error("Push notifications aren't set up yet.");
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") return false;
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && subscriptionServerKey(subscription) !== normalizeBase64Url(vapidPublicKey)) {
      // Made with an old VAPID key: replace it on both sides.
      await unsubscribe({ endpoint: subscription.endpoint }).catch(() => undefined);
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const json = subscription.toJSON();
    if (!json.keys?.p256dh || !json.keys.auth) throw new Error("The browser returned no push keys.");
    await subscribe({
      endpoint: subscription.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      userAgent: navigator.userAgent,
    });
    setEndpoint(subscription.endpoint);
    setSubscriptionKey(normalizeBase64Url(vapidPublicKey));
    return true;
  }, [subscribe, unsubscribe, vapidPublicKey]);

  const disable = useCallback(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await unsubscribe({ endpoint: subscription.endpoint });
    await subscription.unsubscribe();
    setEndpoint(null);
    setSubscriptionKey(null);
  }, [unsubscribe]);

  return { state, enable, disable };
}

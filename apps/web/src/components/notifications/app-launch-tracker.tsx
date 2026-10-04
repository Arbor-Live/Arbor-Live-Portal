"use client";

import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex-api";
import { isMobileDevice, isStandalone, registerServiceWorker, supportsWebPush } from "@/lib/pwa";
import {
  type BeforeInstallPromptEvent,
  setDeferredInstallPrompt,
} from "./install-prompt-store";
import { useUnreadNotifications } from "./use-unread-notifications";

/**
 * Dashboard-wide PWA glue:
 * - reports how the app was opened (Home Screen vs. phone browser), which
 *   settles or creates the "Add to Home Screen" nudge;
 * - keeps Chrome's deferred install prompt for the install dialog;
 * - registers the service worker and keeps the app badge and OS notification
 *   tray in step with what's still unread.
 */
export function AppLaunchTracker() {
  const reportAppLaunch = useMutation(api.appInstall.reportAppLaunch);
  const reported = useRef(false);
  const summary = useUnreadNotifications();

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    const standalone = isStandalone();
    const mobile = isMobileDevice();
    // Desktop browser tabs neither install nor get nudged; skip the write.
    if (!standalone && !mobile) return;
    void reportAppLaunch({ standalone, mobile }).catch(() => undefined);
  }, [reportAppLaunch]);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferredInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (supportsWebPush()) void registerServiceWorker().catch(() => undefined);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!summary) return;
    if ("setAppBadge" in navigator) {
      const badge = summary.count > 0 ? navigator.setAppBadge(summary.count) : navigator.clearAppBadge();
      void badge.catch(() => undefined);
    }
    if (!supportsWebPush()) return;
    const unreadIds = new Set<string>(summary.unread.map((row) => row._id));
    void navigator.serviceWorker.getRegistration().then(async (registration) => {
      const shown = (await registration?.getNotifications()) ?? [];
      for (const notification of shown) {
        if (notification.tag && !unreadIds.has(notification.tag)) notification.close();
      }
    }).catch(() => undefined);
  }, [summary]);

  return null;
}

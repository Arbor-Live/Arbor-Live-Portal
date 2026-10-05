"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex-api";
import { matchesNotificationPath } from "@/lib/notification-paths";
import { useUnreadNotifications } from "./use-unread-notifications";

/**
 * Marks notifications read once their page is open in a visible tab. Mounted
 * once at the root so links outside the dashboard (onboarding) count too.
 */
export function NotificationAutoRead() {
  return (
    <Suspense fallback={null}>
      <NotificationAutoReadInner />
    </Suspense>
  );
}

function NotificationAutoReadInner() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const summary = useUnreadNotifications();
  const markRead = useMutation(api.notifications.markRead);
  const visible = usePageVisible();
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!summary || !visible) return;
    const ids = summary.unread
      .filter((row) => row.path && matchesNotificationPath(row.path, pathname, search))
      .map((row) => row._id)
      .filter((id) => !inFlight.current.has(id));
    if (ids.length === 0) return;
    for (const id of ids) inFlight.current.add(id);
    markRead({ notificationIds: ids })
      .catch(() => {
        // Not worth surfacing; the row stays unread and retries on the next visit.
      })
      .finally(() => {
        for (const id of ids) inFlight.current.delete(id);
      });
  }, [summary, visible, pathname, search, markRead]);

  return null;
}

function usePageVisible() {
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

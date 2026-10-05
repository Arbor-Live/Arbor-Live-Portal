"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";

/** Live unread summary for the signed-in user (bell badge + auto-read). */
export function useUnreadNotifications() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.notifications.getUnreadSummary, isAuthenticated ? {} : "skip");
}

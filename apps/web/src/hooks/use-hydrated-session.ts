"use client";

import { useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";

const subscribeNever = () => () => {};

/** True after hydration (client-only). */
export function useIsClient() {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

/**
 * `authClient.useSession` for server-rendered components. Better Auth hands
 * React the live session as the server snapshot too, so a session loaded before
 * hydration renders differently than the server HTML. Until hydration this
 * reports what the server rendered: no session, pending.
 */
export function useHydratedSession() {
  const hydrated = useIsClient();
  const { data, isPending } = authClient.useSession();
  return hydrated ? { session: data, isPending } : { session: null, isPending: true };
}

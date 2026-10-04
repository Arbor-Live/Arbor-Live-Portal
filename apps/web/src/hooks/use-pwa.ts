"use client";

import { useSyncExternalStore } from "react";
import { isIos, isMobileDevice, isStandalone, supportsWebPush } from "@/lib/pwa";

const subscribeNever = () => () => {};

function subscribeDisplayMode(callback: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** Opened from the Home Screen. False during SSR. */
export function useIsStandalone() {
  return useSyncExternalStore(subscribeDisplayMode, isStandalone, () => false);
}

/** Phone/tablet browser. False during SSR. */
export function useIsMobileDevice() {
  return useSyncExternalStore(subscribeNever, isMobileDevice, () => false);
}

export type PushEnvironment = "pending" | "unsupported" | "needs-install" | "ok";

function pushEnvironment(): PushEnvironment {
  if (supportsWebPush()) return "ok";
  return isIos() && !isStandalone() ? "needs-install" : "unsupported";
}

/** Whether this browser can do Web Push; "pending" during SSR. */
export function usePushEnvironment() {
  return useSyncExternalStore(subscribeNever, pushEnvironment, () => "pending" as const);
}

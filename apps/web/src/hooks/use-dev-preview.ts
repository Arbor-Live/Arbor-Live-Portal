"use client";

import { useSyncExternalStore } from "react";

function subscribeDevPreview(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getDevPreviewSnapshot() {
  if (process.env.NODE_ENV !== "development") return false;
  return new URLSearchParams(window.location.search).get("devPreview") === "1";
}

function getDevPreviewServerSnapshot() {
  return false;
}

const emptySubscribe = () => () => {};

/** True after hydration (client-only). */
function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

/** True in local development when the URL has `?devPreview=1`. */
export function useDevPreview(): boolean {
  return useSyncExternalStore(
    subscribeDevPreview,
    getDevPreviewSnapshot,
    getDevPreviewServerSnapshot,
  );
}

/** Wait until client hydration before applying redirect guards. */
export function useDevPreviewReady(): { ready: boolean; devPreview: boolean } {
  const ready = useIsClient();
  const devPreview = useDevPreview();
  return { ready, devPreview };
}

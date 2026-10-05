"use client";

import { useSyncExternalStore } from "react";

/** Chrome/Android's deferred install prompt (not in lib.dom yet). */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type State = { dialogOpen: boolean; deferredPrompt: BeforeInstallPromptEvent | null };

let state: State = { dialogOpen: false, deferredPrompt: null };
const listeners = new Set<() => void>();

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shared by the bell, the sidebar button, and the dialog itself. */
export function useInstallPrompt() {
  const current = useSyncExternalStore(subscribe, () => state, () => state);
  return {
    ...current,
    openDialog: () => setState({ dialogOpen: true }),
    closeDialog: () => setState({ dialogOpen: false }),
  };
}

export function setDeferredInstallPrompt(deferredPrompt: BeforeInstallPromptEvent | null) {
  setState({ deferredPrompt });
}

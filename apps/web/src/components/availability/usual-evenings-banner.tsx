"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { XIcon } from "@phosphor-icons/react";
import { useSessionShell } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "arbor-usual-evenings-banner-dismissed";
const MY_AVAILABILITY = "/dashboard/events/my-availability";

const dismissListeners = new Set<() => void>();
function subscribeDismissed(listener: () => void) {
  dismissListeners.add(listener);
  return () => dismissListeners.delete(listener);
}
function readDismissed() {
  return sessionStorage.getItem(DISMISS_KEY) === "1";
}
function notifyDismissed() {
  for (const listener of dismissListeners) listener();
}

/**
 * Asks existing crew once for their usual evenings. Hidden while crew
 * onboarding is still open (it has its own step), on My Availability (which
 * shows the question inline), and for the rest of the session once dismissed.
 */
export function UsualEveningsBanner() {
  const shell = useSessionShell();
  const pathname = usePathname();
  // Read after hydration (the server never sees sessionStorage), so the first
  // client render matches the server's.
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => false);

  const crewOnboarding = shell?.onboarding.crew;
  const onboardingOpen =
    crewOnboarding?.applicable && crewOnboarding.status !== "completed" && crewOnboarding.status !== "waived";
  if (!shell?.viewer.needsUsualEvenings || onboardingOpen || dismissed || pathname === MY_AVAILABILITY) {
    return null;
  }

  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm"
      data-testid="usual-evenings-banner"
    >
      <p className="text-foreground/80">
        Which evenings are you usually free? Answer once and new events start from it.
      </p>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={MY_AVAILABILITY}>Answer</Link>
        </Button>
        <button
          type="button"
          aria-label="Dismiss"
          className="text-foreground/50 transition-colors hover:text-foreground"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            notifyDismissed();
          }}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

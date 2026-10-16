"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { XIcon } from "@phosphor-icons/react";
import { useSessionShell } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "arbor-usual-evenings-banner-dismissed";
const MY_AVAILABILITY = "/dashboard/events/my-availability";

/**
 * Asks existing crew once for their usual evenings. Hidden while crew
 * onboarding is still open (it has its own step), on My Availability (which
 * shows the question inline), and for the rest of the session once dismissed.
 */
export function UsualEveningsBanner() {
  const shell = useSessionShell();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1",
  );

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
            setDismissed(true);
          }}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { XIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";

const DISMISS_KEY_PREFIX = "arbor-onboarding-banner-dismissed:";

type BannerTarget = {
  key: string;
  href: string;
  message: string;
};

function readDismissedKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const dismissed = new Set<string>();
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(DISMISS_KEY_PREFIX) && sessionStorage.getItem(key) === "1") {
      dismissed.add(key.slice(DISMISS_KEY_PREFIX.length));
    }
  }
  return dismissed;
}

export function OnboardingBanner() {
  // Same query as AppSidebar — Convex dedupes the subscription.
  const shell = useQuery(api.users.getSessionShell, {});
  const status = shell?.onboarding;
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(readDismissedKeys);

  const target: BannerTarget | null = (() => {
    if (!status) return null;
    if (
      status.crew.applicable &&
      status.crew.status !== "completed" &&
      status.crew.status !== "waived"
    ) {
      const count = status.crew.incompleteStepCount;
      return {
        key: "crew",
        href: "/onboarding",
        message: `Finish your crew onboarding — ${count} step${count === 1 ? "" : "s"} left.`,
      };
    }
    if (
      status.band.applicable &&
      status.band.status !== "completed" &&
      status.band.status !== "waived"
    ) {
      return {
        key: "band",
        href: "/onboarding/band",
        message: "Finish setting up your band profile to get booked and paid.",
      };
    }
    return null;
  })();

  if (!target || dismissedKeys.has(target.key)) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm">
      <p className="text-foreground/80">{target.message}</p>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={target.href}>Continue</Link>
        </Button>
        <button
          type="button"
          aria-label="Dismiss"
          className="text-foreground/50 transition-colors hover:text-foreground"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY_PREFIX + target.key, "1");
            setDismissedKeys((prev) => new Set(prev).add(target.key));
          }}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

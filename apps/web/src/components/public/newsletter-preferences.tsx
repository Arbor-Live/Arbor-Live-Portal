"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { useAppDialog } from "@/components/ui/app-dialog";

type Subscriber = {
  email: string;
  name?: string;
  status: "subscribed" | "unsubscribed";
};

/**
 * Public subscription preferences reached from a newsletter email footer.
 * One action: unsubscribe. Resubscribing happens through the public sign-up
 * forms, which is also where a re-subscribe is recorded.
 */
export function NewsletterPreferences({
  token,
  initial,
}: {
  token: string;
  initial: Subscriber | null;
}) {
  const unsubscribe = useMutation(api.newsletter.unsubscribeByToken);
  const { confirm } = useAppDialog();
  const [state, setState] = useState<"idle" | "working" | "done">("idle");

  if (!initial) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Subscription not found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-foreground/70">
          This link is no longer valid. You can sign up again from the events page.
        </p>
        <Link
          href="/events"
          className="mt-6 inline-block text-sm font-medium text-status-emerald-800 underline-offset-4 hover:underline dark:text-primary"
        >
          See upcoming events →
        </Link>
      </>
    );
  }

  if (state === "done" || initial.status === "unsubscribed") {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          You&apos;re unsubscribed
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-foreground/70">
          {initial.email} won&apos;t receive This Week at Arbor anymore. You&apos;ll still get
          emails about your own events and bookings.
        </p>
        <Link
          href="/events"
          className="mt-6 inline-block text-sm font-medium text-status-emerald-800 underline-offset-4 hover:underline dark:text-primary"
        >
          See upcoming events →
        </Link>
      </>
    );
  }

  async function handleUnsubscribe() {
    const ok = await confirm({
      title: "Unsubscribe from This Week at Arbor?",
      description: `${initial!.email} will stop receiving the weekly newsletter.`,
      confirmLabel: "Unsubscribe",
      destructive: true,
    });
    if (!ok) return;
    setState("working");
    try {
      await unsubscribe({ token });
      setState("done");
    } catch (error) {
      setState("idle");
      notify.error(
        error instanceof Error ? error.message : "Could not unsubscribe. Try again.",
      );
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        This Week at Arbor
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-foreground/70">
        You&apos;re subscribed as {initial.email}.
      </p>
      <div className="mt-6">
        <Button
          variant="outline"
          onClick={() => void handleUnsubscribe()}
          disabled={state === "working"}
        >
          {state === "working" ? "Unsubscribing…" : "Unsubscribe"}
        </Button>
      </div>
    </>
  );
}

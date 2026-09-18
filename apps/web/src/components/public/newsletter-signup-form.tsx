"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type NewsletterSource = "landing" | "open_mic" | "events_page" | "admin";

/**
 * Public "This Week at Arbor" opt-in. Single opt-in: submitting adds the
 * address to the list and the Resend segment directly. One field only — name is
 * optional and used solely for the email greeting.
 */
export function NewsletterSignupForm({
  source,
  className,
  variant = "default",
}: {
  source: NewsletterSource;
  className?: string;
  variant?: "default" | "compact";
}) {
  const subscribe = useMutation(api.newsletter.subscribePublic);
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    try {
      await subscribe({ website: honeypot, email, source });
      setStatus("done");
      setEmail("");
    } catch (error) {
      setStatus("idle");
      notify.error(
        error instanceof Error ? error.message : "Could not subscribe. Try again.",
      );
    }
  }

  if (status === "done") {
    return (
      <p className={cn("text-sm text-foreground/80", className)}>
        You&apos;re on the list — look out for the next email.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        variant === "compact"
          ? "flex flex-col gap-2 sm:flex-row"
          : "flex flex-col gap-2 sm:flex-row",
        className,
      )}
    >
      {/* Honeypot: hidden from people, irresistible to bots. */}
      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(event) => setHoneypot(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <label htmlFor={`newsletter-email-${source}`} className="sr-only">
        Email address
      </label>
      <Input
        id={`newsletter-email-${source}`}
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@stanford.edu"
        autoComplete="email"
        className="sm:max-w-xs"
      />
      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Subscribing…" : "Subscribe"}
      </Button>
    </form>
  );
}

/** Landing-page section wrapper: sits directly under Upcoming events. */
export function LandingNewsletterBand() {
  return (
    <section className="border-b bg-background py-12 sm:py-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            This Week at Arbor
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/70">
            One short email a week with what&apos;s happening on campus.
          </p>
        </div>
        <NewsletterSignupForm source="landing" />
      </div>
    </section>
  );
}

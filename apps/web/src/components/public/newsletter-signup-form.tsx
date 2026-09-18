"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { CalendarSubscribe } from "@/components/public/calendar-subscribe";

/** Public sign-up sources; `admin` is reserved for the authenticated add flow. */
type NewsletterSource = "landing" | "open_mic" | "events_page";

/**
 * Public "This Week at Arbor" opt-in. Single opt-in: submitting adds the
 * address to the list and the Resend segment directly. One field only — name is
 * optional and used solely for the email greeting.
 */
export function NewsletterSignupForm({
  source,
  className,
}: {
  source: NewsletterSource;
  className?: string;
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
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-2 sm:flex-row", className)}>
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

/**
 * "Stay in the loop" — the two ways to keep up with Arbor: the weekly email and
 * a calendar subscription. Both are opt-in and live side by side so nobody has
 * to choose between them.
 */
export function LandingStayInTheLoop() {
  return (
    <section className="border-b bg-background py-12 sm:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Stay in the loop
        </h2>

        <div className="mt-8 grid gap-8 sm:grid-cols-2 sm:gap-12">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Weekly email</h3>
            <p className="mt-1 text-sm leading-relaxed text-foreground/70">
              One short email a week with what&apos;s happening on campus.
            </p>
            <NewsletterSignupForm source="landing" className="mt-3" />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Calendar feed</h3>
            <p className="mt-1 text-sm leading-relaxed text-foreground/70">
              Add our shows to your own calendar. Updates automatically.
            </p>
            <CalendarSubscribe className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2" />
          </div>
        </div>
      </div>
    </section>
  );
}

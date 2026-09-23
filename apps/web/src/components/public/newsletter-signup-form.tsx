"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { CalendarSubscribe } from "@/components/public/calendar-subscribe";
import { EventAddToCalendar } from "@/components/public/event-add-to-calendar";
import type { EventCalendarInput } from "@/lib/event-calendar";

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
 * "Stay in the loop" — the weekly email and a calendar subscription, plus
 * add-this-show links when rendered on an event page. All opt-in.
 */
export function LandingStayInTheLoop({
  source = "landing",
  event,
}: {
  source?: NewsletterSource;
  /** When set, a third column adds this show to Google / Apple / Outlook. */
  event?: EventCalendarInput;
}) {
  return (
    <section className="border-b bg-background py-12 sm:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Stay in the loop
        </h2>

        <div
          className={
            event
              ? "mt-8 grid gap-8 sm:grid-cols-2 sm:gap-12 lg:grid-cols-3"
              : "mt-8 grid gap-8 sm:grid-cols-2 sm:gap-12"
          }
        >
          {event ? (
            <div>
              <h3 className="text-sm font-semibold text-foreground">This show</h3>
              <p className="mt-1 text-sm leading-relaxed text-foreground/70">
                Save the date on your calendar.
              </p>
              <EventAddToCalendar
                event={event}
                className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2"
              />
            </div>
          ) : null}

          <div>
            <h3 className="text-sm font-semibold text-foreground">Weekly email</h3>
            <p className="mt-1 text-sm leading-relaxed text-foreground/70">
              One short email a week with what&apos;s happening on campus.
            </p>
            <NewsletterSignupForm source={source} className="mt-3" />
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

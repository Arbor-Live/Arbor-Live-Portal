"use client";

import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  InfoIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PortalStepTone = "action" | "waiting" | "done" | "info";

export type PortalStep = {
  key: string;
  tone: PortalStepTone;
  title: string;
  body?: string;
  ctaLabel?: string;
  targetTab?: string;
};

export type PortalNextStepInput = {
  declined: boolean;
  finalized: boolean;
  quoteReady: boolean;
  approvalStatus: "pending" | "approved" | "changes_requested";
  payment: { canSubmit: boolean; submitted: boolean; received: boolean };
  eventEnded: boolean;
  eventTitle?: string;
  feedbackSubmitted: boolean;
  albumShareUrl?: string;
};

/**
 * Derive the client's current "what's next" cards from portal state. Returned
 * in priority order; the first actionable step is the primary thing to do.
 */
export function derivePortalNextSteps(input: PortalNextStepInput): PortalStep[] {
  if (input.declined) {
    return [
      {
        key: "declined",
        tone: "info",
        title: "This request was declined",
        body: "Reach out if you have any questions.",
      },
    ];
  }
  if (input.finalized) {
    return [{ key: "finalized", tone: "info", title: "This request is finalized" }];
  }

  const steps: PortalStep[] = [];
  const eventTitle = input.eventTitle ?? "your event";

  if (!input.quoteReady) {
    steps.push({
      key: "quote-prep",
      tone: "waiting",
      title: "We're preparing your quote",
      body: "We'll email you as soon as it's ready to review.",
    });
  } else if (input.approvalStatus === "pending") {
    steps.push({
      key: "quote-approve",
      tone: "action",
      title: "Your quote is ready to review",
      body: "Review the details and approve when everything looks right.",
      ctaLabel: "Review & approve",
      targetTab: "quote",
    });
  } else if (input.approvalStatus === "changes_requested") {
    steps.push({
      key: "quote-changes",
      tone: "waiting",
      title: "We're updating your quote",
      body: "We received your requested changes and will send an updated quote.",
    });
  } else if (input.payment.received) {
    steps.push({
      key: "paid",
      tone: "done",
      title: "Payment received",
      body: "You're all set on billing.",
    });
  } else if (input.payment.submitted) {
    steps.push({
      key: "verifying",
      tone: "waiting",
      title: "Payment submitted — verifying",
      body: "We'll confirm once we've reviewed it.",
    });
  } else if (input.payment.canSubmit) {
    steps.push({
      key: "payment",
      tone: "action",
      title: "Payment pending",
      body: "Submit your payment details so we can close out your invoice.",
      ctaLabel: "Submit payment",
      targetTab: "quote",
    });
  } else {
    steps.push({
      key: "payment",
      tone: "waiting",
      title: "Payment pending",
      body: "Payment opens once your quote is approved.",
    });
  }

  if (input.eventEnded) {
    if (!input.feedbackSubmitted) {
      steps.push({
        key: "feedback",
        tone: "action",
        title: `How was ${eventTitle}?`,
        body: "Your feedback helps us keep improving.",
        ctaLabel: "Share your feedback",
        targetTab: "after",
      });
    } else {
      steps.push({ key: "feedback-done", tone: "done", title: "Thanks for your feedback" });
    }
    if (input.albumShareUrl) {
      steps.push({
        key: "album",
        tone: "info",
        title: "Your event album",
        ctaLabel: "Open the album",
        targetTab: "after",
      });
    }
  }

  if (steps.length === 0) {
    steps.push({
      key: "all-set",
      tone: "done",
      title: "You're all set",
      body: "We'll email you if anything needs your attention.",
    });
  }

  return steps;
}

const TONE_ICON = {
  action: SparkleIcon,
  waiting: ClockIcon,
  done: CheckCircleIcon,
  info: InfoIcon,
} as const;

/** Renders the derived "what's next" cards, with the primary action card first. */
export function PublicPortalNextSteps({
  steps,
  onNavigate,
}: {
  steps: PortalStep[];
  onNavigate: (tab: string) => void;
}) {
  return (
    <div className="space-y-3">
      {steps.map((step) => {
        const Icon = TONE_ICON[step.tone];
        const isAction = step.tone === "action";
        const compact = !step.body && !(isAction && step.ctaLabel);
        return (
          <Card
            key={step.key}
            className={cn("px-4 py-4", isAction && "ring-primary/40")}
          >
            <div className={cn("flex gap-3", compact ? "items-center" : "items-start")}>
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center",
                  !compact && "mt-0.5",
                  isAction ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                <Icon
                  className={cn("size-4", step.tone === "waiting" && "animate-pulse")}
                  weight={isAction ? "fill" : "regular"}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "font-heading text-sm font-medium",
                    step.tone === "done" && "text-muted-foreground",
                  )}
                >
                  {step.title}
                </p>
                {step.body ? (
                  <p className="mt-1 text-sm/relaxed text-muted-foreground">{step.body}</p>
                ) : null}
                {isAction && step.ctaLabel && step.targetTab ? (
                  <Button
                    className="mt-3"
                    size="sm"
                    onClick={() => onNavigate(step.targetTab!)}
                  >
                    {step.ctaLabel}
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

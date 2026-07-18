import type { Icon } from "@phosphor-icons/react";
import {
  CurrencyDollarIcon,
  HeartIcon,
  LightbulbIcon,
  MicrophoneStageIcon,
  SparkleIcon,
  UsersThreeIcon,
  WrenchIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/landing-motion";
import { Button } from "@/components/ui/button";
import { ARBOR_CONTACT_EMAIL } from "@/lib/landing-content";
import { cn } from "@/lib/utils";

const GLASS =
  "border border-border/50 bg-background/70 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl";

type Benefit = {
  title: string;
  body: string;
  icon: Icon;
  className?: string;
};

/** Spans chosen so every breakpoint fills the grid with no empty cells. */
const BENEFITS: Benefit[] = [
  {
    title: "Campus community",
    body: "Join the largest live music community on campus.",
    icon: UsersThreeIcon,
    className: "sm:col-span-2 lg:col-span-4",
  },
  {
    title: "Coolest events",
    body: "Be a part of the coolest and most creative events on campus.",
    icon: SparkleIcon,
  },
  {
    title: "Pro gear",
    body: "Learn live event tech with professional equipment.",
    icon: WrenchIcon,
  },
  {
    title: "Run your own events",
    body: "Take the lead and run your own events.",
    icon: MicrophoneStageIcon,
  },
  {
    title: "Lifelong friends",
    body: "Make lifelong friends.",
    icon: HeartIcon,
  },
  {
    title: "Valuable skills",
    body: "Learn improvising, teamwork, communication, working in high-pressure environments, and adaptability — genuinely one of the most valuable jobs on campus.",
    icon: LightbulbIcon,
    className: "sm:col-span-2 lg:col-span-2",
  },
  {
    title: "Get paid",
    body: "Help shape the live music scene at Stanford — and get paid while doing it.",
    icon: CurrencyDollarIcon,
    className: "sm:col-span-2 lg:col-span-2",
  },
];

const JOIN_MAILTO = `mailto:${ARBOR_CONTACT_EMAIL}?subject=${encodeURIComponent("Join the Arbor Live crew")}`;

export function CrewJoinSection() {
  return (
    <section className="relative overflow-hidden border-t bg-muted/35 py-16 sm:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_90%_0%,color-mix(in_oklch,var(--color-primary)_14%,transparent),transparent)]"
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Crew with Arbor
            </p>
            <h2 className="display-tight mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Why join the crew
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Join and become a part of the live music community at Stanford!
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0 self-start sm:self-auto">
            <a href={JOIN_MAILTO}>Join the crew</a>
          </Button>
        </Reveal>

        <Stagger className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <StaggerItem key={benefit.title} className={benefit.className}>
                <div className={cn(GLASS, "flex h-full flex-col gap-4 p-5 sm:p-6")}>
                  <span className="flex size-10 items-center justify-center border border-border/50 bg-background/50 text-primary">
                    <Icon className="size-5" weight="duotone" />
                  </span>
                  <div className="space-y-2">
                    <h3 className="font-heading text-base font-semibold tracking-tight">
                      {benefit.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{benefit.body}</p>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}

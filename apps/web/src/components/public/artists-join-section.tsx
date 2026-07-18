import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import {
  CalendarBlankIcon,
  EyeIcon,
  HandshakeIcon,
  MicrophoneStageIcon,
  SpeakerHighIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/landing-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GLASS =
  "border border-border/50 bg-background/70 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl";

type Benefit = {
  title: string;
  body: string;
  icon: Icon;
  className?: string;
};

const BENEFITS: Benefit[] = [
  {
    title: "Campus community",
    body: "Join the largest community of musicians on campus — by musicians, for musicians.",
    icon: UsersThreeIcon,
    className: "sm:col-span-2",
  },
  {
    title: "200+ gigs a year",
    body: "Get access to over 200 gigs a year.",
    icon: CalendarBlankIcon,
  },
  {
    title: "Visibility",
    body: "Get visibility on our website and on our socials when you perform.",
    icon: EyeIcon,
  },
  {
    title: "Equipment",
    body: "Get access to equipment borrows and rentals at special rates — for practices or events you host.",
    icon: SpeakerHighIcon,
  },
  {
    title: "Friends event",
    body: "We host an event a year for all your friends for free — we will mix for you.*",
    icon: MicrophoneStageIcon,
  },
  {
    title: "On-campus partners",
    body: "Do a gig with or without Arbor? We can handle your payments or any other logistics you need — much easier and faster than anyone else paying you. We bill whoever hired you for the event, and front your payment as soon as your gig is done.**",
    icon: HandshakeIcon,
    className: "sm:col-span-2 lg:col-span-3",
  },
];

export function ArtistsJoinSection() {
  return (
    <section className="relative overflow-hidden border-t bg-muted/35 py-16 sm:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_10%_0%,color-mix(in_oklch,var(--color-primary)_14%,transparent),transparent)]"
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Perform with Arbor
            </p>
            <h2 className="display-tight mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Why join the roster
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Join and become a part of the live music community at Stanford!
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0 self-start sm:self-auto">
            <Link href="/artists/apply">Join the community</Link>
          </Button>
        </Reveal>

        <Stagger className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

        <Reveal className="mt-4 space-y-1 border border-border/40 bg-background/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground backdrop-blur-md">
          <p>* Given funding and crew availability — limited spots per quarter.</p>
          <p>** Given fund availability in our accounts.</p>
        </Reveal>
      </div>
    </section>
  );
}

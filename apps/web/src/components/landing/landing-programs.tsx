"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { landingMission, landingPrograms } from "@/lib/landing-content";
import { cn } from "@/lib/utils";
import { Reveal, Stagger, StaggerItem } from "./landing-motion";

function ProgramCard({ program }: { program: (typeof landingPrograms)[number] }) {
  const reduceMotion = useReducedMotion();

  return (
    <Card
      className={cn(
        "overflow-hidden py-0 transition-shadow",
        program.featured && "ring-2 ring-primary/40",
      )}
    >
      <motion.div
        aria-hidden
        className={cn(
          "relative h-36 overflow-hidden bg-gradient-to-br sm:h-40",
          program.imageGradient,
        )}
        whileHover={reduceMotion ? undefined : { scale: 1.03 }}
        transition={{ duration: 0.35 }}
      >
        {program.imageSrc ? (
          <Image
            src={program.imageSrc}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/25 to-zinc-950/10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklch,white_18%,transparent),transparent_55%)]" />
        {program.schedule ? (
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
            <span className="bg-zinc-950/70 px-2 py-1 text-xs font-medium text-zinc-100 backdrop-blur-sm">
              {program.schedule.when}
            </span>
            <span className="bg-zinc-950/70 px-2 py-1 text-xs font-medium text-zinc-100 backdrop-blur-sm">
              {program.schedule.where}
            </span>
          </div>
        ) : null}
      </motion.div>
      <CardHeader className="pt-5">
        <CardTitle className="text-lg font-semibold">{program.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pb-6">
        <p className="text-sm leading-relaxed text-muted-foreground">{program.description}</p>
        {program.cta ? (
          <Link
            href={program.cta.href}
            target={program.cta.external ? "_blank" : undefined}
            rel={program.cta.external ? "noopener noreferrer" : undefined}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {program.cta.label}
            {program.cta.external ? <span aria-hidden> ↗</span> : null}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function LandingPrograms() {
  return (
    <section id="programs" className="border-b bg-background py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl">
          <h2 className="display-tight text-3xl font-semibold tracking-tight sm:text-4xl">
            {landingMission.title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {landingMission.body}
          </p>
        </Reveal>

        <Reveal className="mt-10 max-w-2xl" delay={0.08}>
          <h3 className="text-xl font-semibold tracking-tight">{landingMission.seriesTitle}</h3>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {landingMission.seriesSubtitle}
          </p>
        </Reveal>

        <Stagger className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {landingPrograms.map((program) => (
            <StaggerItem
              key={program.id}
              className={cn(program.featured && "sm:col-span-2 lg:col-span-3")}
            >
              <ProgramCard program={program} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

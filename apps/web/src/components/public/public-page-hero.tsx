import Link from "next/link";
import { Reveal } from "@/components/landing/landing-motion";
import { OptimizedRemoteImage } from "@/components/media/optimized-remote-image";
import { cn } from "@/lib/utils";

type PublicPageHeroProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  imageUrl?: string;
  backLink?: { href: string; label: string };
  className?: string;
  dark?: boolean;
};

export function PublicPageHero({
  title,
  subtitle,
  eyebrow,
  imageUrl,
  backLink,
  className,
  dark = true,
}: PublicPageHeroProps) {
  const hasImage = Boolean(imageUrl);

  return (
    <section
      className={cn(
        "relative overflow-hidden border-b pt-24 pb-14 sm:pt-28 sm:pb-20",
        dark ? "bg-zinc-950 text-zinc-50" : "bg-muted/30",
        hasImage && "pt-28 pb-16 sm:pt-32 sm:pb-24",
        className,
      )}
    >
      {hasImage ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-900/80 via-primary/35 to-zinc-950"
          />
          <OptimizedRemoteImage
            src={imageUrl!}
            alt=""
            fill
            priority
            sizes="100vw"
            className="absolute inset-0 size-full object-cover opacity-45"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-zinc-950/20"
          />
        </>
      ) : dark ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--color-primary)_30%,transparent),transparent)]"
        />
      ) : null}
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          {backLink ? (
            <Link
              href={backLink.href}
              className="text-sm text-zinc-300 transition-colors hover:text-white hover:underline"
            >
              {backLink.label}
            </Link>
          ) : null}
          {eyebrow ? (
            <p
              className={cn(
                "text-xs font-medium uppercase tracking-[0.14em]",
                dark ? "text-zinc-400" : "text-muted-foreground",
                backLink ? "mt-6" : undefined,
              )}
            >
              {eyebrow}
            </p>
          ) : null}
          <h1
            className={cn(
              "display-tight text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl",
              (backLink || eyebrow) && "mt-3",
            )}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className={cn(
                "mt-4 max-w-3xl text-base leading-relaxed sm:text-lg",
                dark ? "text-zinc-300" : "text-muted-foreground",
              )}
            >
              {subtitle}
            </p>
          ) : null}
        </Reveal>
      </div>
    </section>
  );
}

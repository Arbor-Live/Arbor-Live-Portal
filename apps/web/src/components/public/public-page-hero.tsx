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
  /** Force the dark zinc hero even in light mode. */
  dark?: boolean;
};

export function PublicPageHero({
  title,
  subtitle,
  eyebrow,
  imageUrl,
  backLink,
  className,
  dark = false,
}: PublicPageHeroProps) {
  const hasImage = Boolean(imageUrl);

  return (
    <section
      className={cn(
        "relative overflow-hidden border-b pt-24 pb-14 sm:pt-28 sm:pb-20",
        dark
          ? "bg-zinc-950 text-zinc-50"
          : "bg-muted/40 text-foreground dark:bg-zinc-950 dark:text-zinc-50",
        hasImage && "pt-28 pb-16 sm:pt-32 sm:pb-24",
        className,
      )}
    >
      {hasImage ? (
        <>
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 bg-gradient-to-br",
              dark
                ? "from-emerald-900/80 via-primary/35 to-zinc-950"
                : "from-emerald-100 via-primary/20 to-muted dark:from-emerald-900/80 dark:via-primary/35 dark:to-zinc-950",
            )}
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
            className={cn(
              "pointer-events-none absolute inset-0 bg-gradient-to-t",
              dark
                ? "from-zinc-950 via-zinc-950/70 to-zinc-950/20"
                : "from-background via-background/70 to-background/20 dark:from-zinc-950 dark:via-zinc-950/70 dark:to-zinc-950/20",
            )}
          />
        </>
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--color-primary)_22%,transparent),transparent)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--color-primary)_30%,transparent),transparent)]"
        />
      )}
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          {backLink ? (
            <Link
              href={backLink.href}
              className={cn(
                "text-sm transition-colors hover:underline",
                dark
                  ? "text-zinc-300 hover:text-white"
                  : "text-muted-foreground hover:text-foreground dark:text-zinc-300 dark:hover:text-white",
              )}
            >
              {backLink.label}
            </Link>
          ) : null}
          {eyebrow ? (
            <p
              className={cn(
                "text-xs font-medium uppercase tracking-[0.14em]",
                dark
                  ? "text-zinc-400"
                  : "text-muted-foreground dark:text-zinc-400",
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
                dark
                  ? "text-zinc-300"
                  : "text-muted-foreground dark:text-zinc-300",
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

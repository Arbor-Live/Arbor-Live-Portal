import { Reveal } from "@/components/landing/landing-motion";
import { cn } from "@/lib/utils";

type PublicPageHeroProps = {
  title: string;
  subtitle?: string;
  className?: string;
  dark?: boolean;
};

export function PublicPageHero({ title, subtitle, className, dark = true }: PublicPageHeroProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden border-b py-14 sm:py-20",
        dark ? "bg-zinc-950 text-zinc-50" : "bg-muted/30",
        className,
      )}
    >
      {dark ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--color-primary)_30%,transparent),transparent)]"
        />
      ) : null}
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <h1 className="display-tight text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          {subtitle ? (
            <p
              className={cn(
                "mt-4 max-w-2xl text-base leading-relaxed sm:text-lg",
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

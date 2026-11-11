import Image from "next/image";
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  XCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { BrandCopyButton } from "@/components/public/brand-copy-button";
import {
  LogomarkConstruction,
  WordmarkConstruction,
} from "@/components/public/brand-construction";
import {
  BRAND_FIGMA_URL,
  BRAND_INSTAGRAM_HANDLE,
  BRAND_INSTAGRAM_URL,
  BRAND_KIT_URL,
  brandColorsOnDark,
  brandColorsOnLight,
  brandCreditTiers,
  brandLogomarks,
  brandNames,
  brandWordmarkRules,
  brandWordmarks,
  type BrandAsset,
  type BrandColor,
  type BrandCreditTier,
} from "@/lib/brand-guidelines";
import { ARBOR_EXTERNAL_SITE } from "@/lib/landing-content";
import { cn } from "@/lib/utils";

const sections = [
  { id: "credit", label: "Crediting us" },
  { id: "names", label: "Names" },
  { id: "wordmark", label: "Wordmark" },
  { id: "logomark", label: "Logomark" },
  { id: "color", label: "Color & type" },
  { id: "wallpaper", label: "Wallpaper" },
];

/** Brand ink on a dark surface: the guideline's own dark green. */
const DARK_SURFACE = "bg-brand-ink";

export function BrandGuidelines() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
      <nav
        aria-label="On this page"
        className="sticky top-20 z-10 -mx-4 mt-8 overflow-x-auto border-y bg-background/90 px-4 backdrop-blur sm:top-24 sm:mx-0 sm:border-x sm:px-2"
      >
        <ul className="flex gap-1 py-2 text-sm whitespace-nowrap">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <CreditSection />
      <NamesSection />
      <WordmarkSection />
      <LogomarkSection />
      <ColorSection />
      <WallpaperSection />
    </div>
  );
}

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-40 border-b py-14 last:border-b-0 sm:py-20">
      <p className="font-mono text-xs text-primary">
        {String(sections.findIndex((s) => s.id === id) + 1).padStart(2, "0")} /{" "}
        {sections.find((s) => s.id === id)?.label.toLowerCase()}
      </p>
      <h2 className="display-tight mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {intro ? (
        <div className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{intro}</div>
      ) : null}
      <div className="mt-10">{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------- Credit */

const requirementLabel: Record<BrandCreditTier["requirement"], string> = {
  required: "Required",
  "required-if-discounted": "Required if discounted",
  optional: "Optional",
};

function CreditSection() {
  return (
    <Section
      id="credit"
      title="Crediting Arbor Live"
      intro={
        <>
          <p>
            We stand behind our work. If Arbor Live helped produce your event, please credit us
            in your marketing. Find your situation below, pick a line or a badge, and tag{" "}
            <a
              href={BRAND_INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-4"
            >
              {BRAND_INSTAGRAM_HANDLE}
            </a>{" "}
            on Instagram or link{" "}
            <a
              href={ARBOR_EXTERNAL_SITE}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-4"
            >
              our website
            </a>
            .
          </p>
          <p className="mt-3">
            These are guidelines. If other wording fits your event better, ask your Arbor Live
            contact and we&apos;ll talk it through.
          </p>
        </>
      }
    >
      <div className="grid gap-6">
        {brandCreditTiers.map((tier) => (
          <CreditTierCard key={tier.id} tier={tier} />
        ))}
      </div>
    </Section>
  );
}

function CreditTierCard({ tier }: { tier: BrandCreditTier }) {
  const required = tier.requirement !== "optional";
  return (
    <article
      id={`credit-${tier.id}`}
      className={cn(
        "grid scroll-mt-40 gap-8 border p-5 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]",
        required && "border-primary/50 bg-primary/[0.03]",
      )}
    >
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold">{tier.title}</h3>
          <span
            className={cn(
              "border px-2 py-0.5 text-xs font-medium uppercase tracking-eyebrow-tight",
              required
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {requirementLabel[tier.requirement]}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{tier.when}</p>
        <ul className="mt-5 space-y-2">
          {tier.phrases.map((phrase) => (
            <li key={phrase}>
              <BrandCopyButton value={phrase} className="text-base font-medium" />
            </li>
          ))}
        </ul>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{tier.note}</p>
      </div>

      <div className="grid content-start gap-3 sm:grid-cols-2">
        {(["black", "white"] as const).map((ink) => {
          const href = `/brand/badges/${tier.badge.slug}-${ink}.png`;
          return (
            <a
              key={ink}
              href={href}
              download
              className={cn(
                "group relative flex flex-col justify-between gap-4 border p-4 transition-colors",
                ink === "black" ? "bg-white" : cn(DARK_SURFACE, "border-transparent dark:border-border"),
              )}
            >
              <Image
                src={href}
                alt={`“${tier.badge.label} Arbor Live” badge, ${ink}`}
                width={4204}
                height={1246}
                sizes="(max-width: 640px) 90vw, 300px"
                className="h-auto w-full"
              />
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium",
                  ink === "black" ? "text-brand-ink/70" : "text-white/70",
                  "group-hover:underline",
                )}
              >
                <DownloadSimpleIcon aria-hidden className="size-3.5" />
                {ink === "black" ? "For light backgrounds" : "For dark backgrounds"} · PNG
              </span>
            </a>
          );
        })}
      </div>
    </article>
  );
}

/* ----------------------------------------------------------------- Names */

function NamesSection() {
  return (
    <Section
      id="names"
      title="How to refer to us"
      intro="Arbor started as a way to bring live events back to Tresidder after the pandemic. Today Arbor Live brings live events to every corner of campus. Use the name that matches the part of Arbor you worked with."
    >
      <dl className="grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {brandNames.map((n) => (
          <div key={n.name} className="bg-background p-5 last:sm:col-span-2 last:lg:col-span-2">
            <dt className="font-semibold">{n.name}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {n.description}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/* --------------------------------------------------------------- Assets */

function AssetTile({ asset, aspect }: { asset: BrandAsset; aspect: string }) {
  const dark = asset.surface === "dark";
  return (
    <figure className="flex flex-col">
      <div
        className={cn(
          "flex items-center justify-center border p-8 sm:p-10",
          aspect,
          dark ? cn(DARK_SURFACE, "border-transparent dark:border-border") : "bg-white",
        )}
      >
        <Image
          src={asset.href}
          alt={asset.label}
          width={asset.width}
          height={asset.height}
          className="h-full max-h-40 w-auto object-contain"
        />
      </div>
      <figcaption className="mt-2 flex items-center justify-between gap-3 text-sm">
        <span>{asset.label}</span>
        <a
          href={asset.href}
          download
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
        >
          <DownloadSimpleIcon aria-hidden className="size-3.5" />
          SVG
        </a>
      </figcaption>
    </figure>
  );
}

function WordmarkSection() {
  return (
    <Section
      id="wordmark"
      title="Wordmark"
      intro="Our wordmark is the full name, Arbor Live, in black or white."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {brandWordmarks.map((asset) => (
          <AssetTile key={asset.href} asset={asset} aspect="aspect-video" />
        ))}
      </div>

      <WordmarkConstruction />

      <ul className="mt-10 grid gap-3 sm:grid-cols-2">
        {brandWordmarkRules.map((rule) => (
          <li key={rule.text} className="flex gap-3 text-sm leading-relaxed">
            {rule.ok ? (
              <CheckCircleIcon aria-hidden weight="fill" className="mt-0.5 size-5 shrink-0 text-primary" />
            ) : (
              <XCircleIcon aria-hidden weight="fill" className="mt-0.5 size-5 shrink-0 text-destructive" />
            )}
            <span>
              <span className="sr-only">{rule.ok ? "Do: " : "Don't: "}</span>
              {rule.text}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        <figure>
          <Image
            src="/brand/examples/texture.jpg"
            alt="The white Arbor Live wordmark with a grain texture on a blue, green and red gradient banner reading Event Calendar"
            width={1600}
            height={565}
            sizes="(max-width: 1024px) 100vw, 560px"
            className="h-auto w-full border"
          />
          <figcaption className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The wordmark can sit on any surface with enough contrast. Texture adds depth.
          </figcaption>
        </figure>
        <figure>
          <Image
            src="/brand/examples/optical-centering.png"
            alt="The white Arbor Live wordmark centered on dark green, nudged down so the word Arbor sits on the center line"
            width={1200}
            height={423}
            sizes="(max-width: 1024px) 100vw, 560px"
            className="h-auto w-full border"
          />
          <figcaption className="mt-3 text-sm leading-relaxed text-muted-foreground">
            When centering, shift the wordmark down slightly so that “Arbor”, not the whole
            mark, sits in the middle.
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}

function LogomarkSection() {
  return (
    <Section
      id="logomark"
      title="Logomark"
      intro="The logomark is the tree that forms the A in Arbor Live. It can be any color, but we strongly prefer black or white. The outline version can hold text, set in Neutra Display."
    >
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {brandLogomarks.map((asset) => (
          <AssetTile key={asset.href} asset={asset} aspect="aspect-square" />
        ))}
      </div>

      <LogomarkConstruction />
    </Section>
  );
}

/* ---------------------------------------------------------------- Color */

function Swatch({ color }: { color: BrandColor }) {
  return (
    <div className="flex flex-col">
      <div
        className="aspect-photo border"
        style={{ backgroundColor: color.hex }}
        aria-hidden
      />
      <div className="mt-2 flex items-center justify-between gap-2 text-sm">
        <span>{color.name}</span>
        <BrandCopyButton value={color.hex} className="font-mono text-xs text-muted-foreground" />
      </div>
    </div>
  );
}

function ColorSection() {
  return (
    <Section id="color" title="Color & type">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium uppercase tracking-eyebrow text-muted-foreground">
            On light backgrounds
          </h3>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {brandColorsOnLight.map((c) => (
              <Swatch key={c.hex} color={c} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium uppercase tracking-eyebrow text-muted-foreground">
            On dark backgrounds
          </h3>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {brandColorsOnDark.map((c) => (
              <Swatch key={c.hex} color={c} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10">
        <div
          aria-hidden
          className="h-16 border bg-gradient-to-r from-brand-ink to-brand-green"
        />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Gradients are fine as long as they start or end on one of the colors above. Other
          colors can be used when needed to fit a partner&apos;s own marketing guidelines.
        </p>
      </div>

      <div className="mt-12 border p-5 sm:p-8">
        <p className="text-sm font-medium uppercase tracking-eyebrow text-muted-foreground">
          Typeface
        </p>
        <p className="mt-3 text-3xl font-bold tracking-wide uppercase sm:text-4xl">
          Neutra Display
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          “LIVE” and any other words in our branding are set in Neutra Display. It&apos;s a
          licensed font, so it isn&apos;t in the brand kit. If you don&apos;t have it, use the
          badges above, which already include the type.
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ Wallpaper */

function WallpaperSection() {
  return (
    <Section id="wallpaper" title="Wallpaper">
      <a href="/brand/arbor-live-wallpaper.png" download className="group block">
        <Image
          src="/brand/arbor-live-wallpaper.png"
          alt="Arbor Live wallpaper: a small green wordmark centered on a dark blue, purple and green gradient"
          width={3840}
          height={2639}
          sizes="(max-width: 1200px) 100vw, 1152px"
          className="h-auto w-full border"
        />
        <span className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground group-hover:text-foreground group-hover:underline">
          <DownloadSimpleIcon aria-hidden className="size-4" />
          Download wallpaper (PNG, 3840 × 2639)
        </span>
      </a>
    </Section>
  );
}

export function BrandHeroActions() {
  return (
    <>
      <Button asChild size="lg">
        <a href={BRAND_KIT_URL} download>
          <DownloadSimpleIcon aria-hidden data-icon="inline-start" />
          Download brand kit
        </a>
      </Button>
      <Button asChild size="lg" variant="outline">
        <a href={BRAND_FIGMA_URL} target="_blank" rel="noopener noreferrer">
          Open in Figma
          <ArrowSquareOutIcon aria-hidden data-icon="inline-end" />
        </a>
      </Button>
    </>
  );
}

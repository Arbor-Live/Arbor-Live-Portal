import { OptimizedRemoteImage } from "@/components/media/optimized-remote-image";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
import { MarkdownContent } from "@/components/markdown-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/landing-motion";
import type { PublicCapabilityFilter } from "@/components/public/public-types-explorer";
import type { PublicPackageBucket } from "@/lib/site-revalidation";

const bucketLabels: Record<PublicPackageBucket, string> = {
  lighting: "Lighting",
  sound: "Sound",
  environmental: "Environmental",
  staging: "Staging",
  misc: "Misc",
};

type PublicTypeSummary = {
  _id: string;
  name: string;
  category: string;
  description?: string;
  capabilities: string[];
  publicProfileEnabled: false;
};

type ResourceLink = { title: string; url: string };

type PublicTypeProfile = {
  _id: string;
  name: string;
  category: string;
  description?: string;
  capabilities: string[];
  publicProfileEnabled: true;
  model?: string;
  manufacturer?: string;
  manualUrls?: ResourceLink[];
  tips?: string;
  iconImageUrl?: string;
  promoImageUrl?: string;
  categoryMetadata?: {
    lighting?: { gdtfUrls?: ResourceLink[] };
  };
};

function isPublicTypeProfile(type: PublicTypeSummary | PublicTypeProfile): type is PublicTypeProfile {
  return type.publicProfileEnabled === true;
}

type PublicContentItem = {
  quantity: number;
  role: "primary" | "accessory";
  bucket: PublicPackageBucket;
  type: PublicTypeSummary | PublicTypeProfile;
};

export type PublicPackageDetailData = {
  bucket: PublicPackageBucket;
  package: {
    _id: string;
    name: string;
    description?: string;
    publicHeroImageUrl?: string;
    publicSlug?: string;
  };
  contents: Array<{
    quantity: number;
    exclusive: boolean;
    options: Array<{
      name: string;
      items: PublicContentItem[];
    }>;
  }>;
};

function AccessoriesDisclosure({ accessories }: { accessories: PublicContentItem[] }) {
  if (!accessories.length) return null;
  const label =
    accessories.length === 1 ? "1 accessory" : `${accessories.length} accessories`;

  return (
    <details className="group rounded-md border bg-muted/20">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
          {label}
        </span>
      </summary>
      <ul className="space-y-1 border-t px-3 py-2 text-sm text-muted-foreground">
        {accessories.map((item) => (
          <li key={`${item.type._id}-${item.quantity}`}>
            {item.quantity}× {item.type.name}
          </li>
        ))}
      </ul>
    </details>
  );
}

function KitCard({
  option,
  exclusive,
  unitQuantity,
  labelByKey,
}: {
  option: { name: string; items: PublicContentItem[] };
  exclusive: boolean;
  unitQuantity: number;
  labelByKey: Map<string, string>;
}) {
  const primary = option.items.find((item) => item.role === "primary");
  const accessories = option.items.filter((item) => item.role === "accessory");
  const type = primary?.type;
  const profile = type && isPublicTypeProfile(type) ? type : null;
  const title = exclusive
    ? option.name
    : primary
      ? `${primary.quantity}× ${primary.type.name}`
      : option.name;

  return (
    <Card className="h-full min-w-0">
      {profile && (profile.promoImageUrl || profile.iconImageUrl) ? (
        <div className="grid gap-3 border-b p-4 sm:grid-cols-2">
          {profile.promoImageUrl ? (
            <OptimizedRemoteImage
              src={profile.promoImageUrl}
              alt=""
              width={400}
              height={256}
              sizes="(max-width: 768px) 100vw, 25vw"
              className="h-32 w-full rounded-md border object-cover"
            />
          ) : null}
          {profile.iconImageUrl ? (
            <OptimizedRemoteImage
              src={profile.iconImageUrl}
              alt=""
              width={400}
              height={256}
              sizes="(max-width: 768px) 100vw, 25vw"
              className="h-32 w-full rounded-md border bg-muted/30 object-contain p-3"
            />
          ) : null}
        </div>
      ) : null}

      <CardHeader className="space-y-1">
        <CardTitle className="text-balance text-base leading-snug">
          {title}
          {!exclusive && profile?.model ? ` · ${profile.model}` : ""}
        </CardTitle>
        {exclusive && primary ? (
          <p className="text-sm text-muted-foreground">
            {unitQuantity > 1 ? `${unitQuantity}× ` : ""}
            {primary.quantity}× {primary.type.name}
            {profile?.model ? ` · ${profile.model}` : ""}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="min-w-0 space-y-4 text-sm">
        <AccessoriesDisclosure accessories={accessories} />

        {type?.description ? (
          <MarkdownContent className="text-muted-foreground">{type.description}</MarkdownContent>
        ) : null}

        {type?.capabilities.length ? (
          <div className="flex flex-wrap gap-1">
            {type.capabilities.map((key) => (
              <span
                key={key}
                className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {labelByKey.get(key) ?? key}
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PublicPackageDetailContent({
  data,
  capabilityFilters,
}: {
  data: PublicPackageDetailData;
  capabilityFilters: PublicCapabilityFilter[];
}) {
  const labelByKey = new Map(capabilityFilters.map((entry) => [entry.key, entry.label]));
  const bucketLabel = bucketLabels[data.bucket] ?? data.bucket;

  return (
    <PublicSiteChrome>
      <PublicPageHero
        title={data.package.name}
        eyebrow={`${bucketLabel} package`}
        imageUrl={data.package.publicHeroImageUrl}
        backLink={{ href: "/packages", label: "← All packages" }}
      />

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
        {data.package.description ? (
          <Reveal>
            <div className="max-w-3xl min-w-0">
              <MarkdownContent className="text-base leading-relaxed text-muted-foreground">
                {data.package.description}
              </MarkdownContent>
            </div>
          </Reveal>
        ) : null}

        <section className="space-y-8">
          <Reveal>
            <h2 className="text-xl font-semibold tracking-tight">What&apos;s included</h2>
          </Reveal>

          {(data.contents ?? []).map((unit, unitIndex) => (
            <div key={`unit-${unitIndex}`} className="space-y-4">
              {unit.exclusive ? (
                <Reveal>
                  <h3 className="text-lg font-semibold tracking-tight">
                    {unit.quantity}×{" "}
                    <span className="font-normal text-muted-foreground">
                      Multiple options available
                    </span>
                  </h3>
                </Reveal>
              ) : null}
              <Stagger className="grid gap-6 md:grid-cols-2">
                {unit.options.map((option) => (
                  <StaggerItem key={option.name}>
                    <KitCard
                      option={option}
                      exclusive={unit.exclusive}
                      unitQuantity={unit.quantity}
                      labelByKey={labelByKey}
                    />
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          ))}
        </section>
      </div>
    </PublicSiteChrome>
  );
}

export function PublicPackageUnavailable() {
  return (
    <PublicSiteChrome>
      <PublicPageHero
        title="Package not available"
        subtitle="This package is not public, inactive, or does not exist."
      />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ask an admin to enable public listing on this package, or return to the packages catalog.
          </CardContent>
        </Card>
      </div>
    </PublicSiteChrome>
  );
}

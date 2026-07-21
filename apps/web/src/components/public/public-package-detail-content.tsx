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

export type PublicPackageDetailData = {
  bucket: PublicPackageBucket;
  package: {
    _id: string;
    name: string;
    description?: string;
    publicHeroImageUrl?: string;
    publicSlug?: string;
  };
  items: Array<{
    quantity: number;
    bucket: PublicPackageBucket;
    type: PublicTypeSummary | PublicTypeProfile;
  }>;
};

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

        <section className="space-y-6">
          <Reveal>
            <h2 className="text-xl font-semibold tracking-tight">What&apos;s included</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Equipment bundled in this package, grouped by category.
            </p>
          </Reveal>

          <Stagger className="grid gap-6 md:grid-cols-2">
            {data.items.map((row) => {
              const type = row.type;
              const hasProfile = isPublicTypeProfile(type);
              const lineBucket = bucketLabels[row.bucket] ?? row.bucket;

              return (
                <StaggerItem key={`${row.quantity}-${type._id}`}>
                  <Card className="h-full min-w-0">
                    {hasProfile && (type.promoImageUrl || type.iconImageUrl) ? (
                      <div className="grid gap-3 border-b p-4 sm:grid-cols-2">
                        {type.promoImageUrl ? (
                          <OptimizedRemoteImage
                            src={type.promoImageUrl}
                            alt=""
                            width={400}
                            height={256}
                            sizes="(max-width: 768px) 100vw, 25vw"
                            className="h-32 w-full rounded-md border object-cover"
                          />
                        ) : null}
                        {type.iconImageUrl ? (
                          <OptimizedRemoteImage
                            src={type.iconImageUrl}
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
                        {row.quantity}× {type.name}
                        {hasProfile && type.model ? ` · ${type.model}` : ""}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{lineBucket}</p>
                    </CardHeader>

                    <CardContent className="min-w-0 space-y-4 text-sm">
                      {type.description ? (
                        <MarkdownContent className="text-muted-foreground">{type.description}</MarkdownContent>
                      ) : null}

                      {type.capabilities.length ? (
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

                      {!hasProfile ? (
                        <p className="text-muted-foreground">
                          Listed as part of this package — no separate public product page.
                        </p>
                      ) : (
                        <>
                          {type.tips ? (
                            <div className="min-w-0">
                              <p className="text-sm font-medium">Tips</p>
                              <MarkdownContent className="text-muted-foreground">{type.tips}</MarkdownContent>
                            </div>
                          ) : null}

                          {type.manualUrls?.length ? (
                            <div>
                              <p className="text-sm font-medium">Manuals</p>
                              <ul className="mt-2 list-disc space-y-1 pl-5">
                                {type.manualUrls.map((link) => (
                                  <li key={`${link.title}-${link.url}`} className="break-all">
                                    <a className="underline" href={link.url} target="_blank" rel="noreferrer">
                                      {link.title}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {type.categoryMetadata?.lighting?.gdtfUrls?.length ? (
                            <div>
                              <p className="text-sm font-medium">GDTF</p>
                              <ul className="mt-2 list-disc space-y-1 pl-5">
                                {type.categoryMetadata.lighting.gdtfUrls.map((link) => (
                                  <li key={`${link.title}-${link.url}`} className="break-all">
                                    <a className="underline" href={link.url} target="_blank" rel="noreferrer">
                                      {link.title}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </StaggerItem>
              );
            })}
          </Stagger>
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

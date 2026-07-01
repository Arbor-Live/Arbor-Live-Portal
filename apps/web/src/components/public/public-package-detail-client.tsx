"use client";

/* eslint-disable @next/next/no-img-element -- public pages may reference arbitrary external image URLs */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
import { MarkdownContent } from "@/components/markdown-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PublicBucket = "lighting" | "sound" | "environmental" | "staging" | "misc";

const bucketLabels: Record<PublicBucket, string> = {
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

export function PublicPackageDetailClient({ packageId }: { packageId: Id<"inventoryPackages"> }) {
  const data = useQuery(api.publicInventory.getPublicPackage, { packageId });
  const capabilityFilters = useQuery(api.publicInventory.listPublicCapabilityFilters, {});

  const labelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of capabilityFilters ?? []) {
      map.set(entry.key, entry.label);
    }
    return map;
  }, [capabilityFilters]);

  if (data === undefined) {
    return (
      <PublicSiteChrome>
        <PublicPageHero title="Equipment package" subtitle="Loading package details…" />
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </PublicSiteChrome>
    );
  }

  if (!data) {
    return (
      <PublicSiteChrome>
        <PublicPageHero title="Package not available" subtitle="This package is not public, inactive, or does not exist." />
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

  const packageHero = data.package.publicHeroImageUrl;

  return (
    <PublicSiteChrome>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="space-y-10">
        {packageHero ? (
          <div className="relative -mx-4 overflow-hidden rounded-b-2xl border-b border-border/80 shadow-md sm:-mx-4">
            <div className="relative aspect-[21/9] min-h-[min(52vh,28rem)] w-full max-h-[min(60vh,32rem)]">
              <img
                src={packageHero}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/10"
                aria-hidden
              />
              <div className="absolute inset-x-0 bottom-0 px-5 pb-8 pt-24 sm:px-8">
                <h1 className="text-balance text-3xl font-semibold tracking-tight drop-shadow-sm sm:text-4xl">
                  {data.package.name}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {bucketLabels[data.bucket as PublicBucket] ?? data.bucket} package
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-b border-border/60 pb-8">
            <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{data.package.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Grouped under: {bucketLabels[data.bucket as PublicBucket] ?? data.bucket}
            </p>
          </div>
        )}

        {data.package.description ? (
          <div className="text-muted-foreground">
            <MarkdownContent>{data.package.description}</MarkdownContent>
          </div>
        ) : null}

        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">What&apos;s included</h2>
          <div className="space-y-8">
            {data.items.map((row) => {
              const type = row.type as PublicTypeSummary | PublicTypeProfile;
              const hasProfile = isPublicTypeProfile(type);
              const showLineHero = hasProfile && Boolean(type.promoImageUrl || type.iconImageUrl);

              return (
                <Card key={`${row.quantity}-${type._id}`} className="overflow-hidden p-0 shadow-md">
                  {showLineHero ? (
                    <div className="relative border-b border-border/60 bg-muted/20">
                      {type.promoImageUrl ? (
                        <div className="relative aspect-[2.2/1] min-h-[14rem] w-full sm:min-h-[16rem] md:aspect-[2.5/1] md:min-h-[18rem]">
                          <img
                            src={type.promoImageUrl}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                          <div
                            className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/25 to-transparent"
                            aria-hidden
                          />
                          {type.iconImageUrl ? (
                            <div className="absolute bottom-4 right-4 z-10 h-24 w-24 overflow-hidden rounded-xl border-2 border-background bg-background shadow-lg sm:h-28 sm:w-28">
                              <img
                                src={type.iconImageUrl}
                                alt=""
                                className="h-full w-full object-contain p-2"
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex min-h-[12rem] items-center justify-center bg-gradient-to-b from-muted/50 to-muted/20 px-6 py-10">
                          {type.iconImageUrl ? (
                            <img
                              src={type.iconImageUrl}
                              alt=""
                              className="max-h-40 w-auto max-w-[min(100%,20rem)] object-contain"
                            />
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}

                  <CardHeader className="space-y-1 px-5 pt-6 sm:px-6">
                    <CardTitle className="text-balance text-xl font-semibold sm:text-2xl">
                      {row.quantity}× {type.name}
                      {hasProfile && type.model ? ` · ${type.model}` : ""}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Line bucket: {bucketLabels[row.bucket as PublicBucket] ?? row.bucket}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-5 px-5 pb-6 text-sm sm:px-6">
                    {type.description ? (
                      <div>
                        <p className="text-sm font-medium text-foreground">Description</p>
                        <MarkdownContent className="text-muted-foreground">{type.description}</MarkdownContent>
                      </div>
                    ) : null}

                    {type.capabilities.length ? (
                      <div>
                        <p className="text-sm font-medium text-foreground">Capabilities</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {type.capabilities.map((key) => (
                            <span
                              key={key}
                              className="rounded-full border border-border/80 bg-muted/50 px-3 py-1 text-xs text-muted-foreground"
                            >
                              {labelByKey.get(key) ?? key}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {!hasProfile ? (
                      <p className="text-muted-foreground">
                        Listed only as part of this package — no separate public product page, manuals, or GDTF here.
                      </p>
                    ) : (
                      <>
                        {type.tips ? (
                          <div>
                            <p className="text-sm font-medium text-foreground">Tips</p>
                            <MarkdownContent className="text-muted-foreground">{type.tips}</MarkdownContent>
                          </div>
                        ) : null}

                        {type.manualUrls?.length ? (
                          <div>
                            <p className="text-sm font-medium text-foreground">Resources</p>
                            <ul className="mt-2 list-disc space-y-1.5 pl-5">
                              {type.manualUrls.map((link) => (
                                <li key={`${link.title}-${link.url}`}>
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
                            <p className="text-sm font-medium text-foreground">GDTF</p>
                            <ul className="mt-2 list-disc space-y-1.5 pl-5">
                              {type.categoryMetadata.lighting.gdtfUrls.map((link) => (
                                <li key={`${link.title}-${link.url}`}>
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
              );
            })}
          </div>
        </div>
      </div>
      </div>
    </PublicSiteChrome>
  );
}

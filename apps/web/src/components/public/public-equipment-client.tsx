"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { StoredAssetImage } from "@/components/files/stored-asset-image";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
import { PublicEquipmentSkeleton } from "@/components/public/public-skeletons";
import { MarkdownContent } from "@/components/markdown-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LOST_FOUND_SUBTITLE =
  "This equipment belongs to Arbor Live. If you found it, please return it using the contact information below.";

type PublicTypeSummary = {
  _id: string;
  name: string;
  model?: string;
  manufacturer?: string;
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

export function PublicEquipmentClient({ assetId }: { assetId: string }) {
  const data = useQuery(api.publicInventory.equipmentByAssetId, { assetId });
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
        <PublicPageHero title="Lost & Found" subtitle={LOST_FOUND_SUBTITLE} shaderBand />
        <PublicEquipmentSkeleton />
      </PublicSiteChrome>
    );
  }

  if (!data) {
    return (
      <PublicSiteChrome>
        <PublicPageHero title="Equipment not found" subtitle="This asset ID is not registered or may have been retired." />
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <Card>
            <CardHeader>
              <CardTitle>Unknown asset</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Double-check the ID on the equipment label, or contact Arbor Live if you believe this is an error.
            </CardContent>
          </Card>
        </div>
      </PublicSiteChrome>
    );
  }

  const type = data.type as PublicTypeSummary | PublicTypeProfile;
  const showProfile = isPublicTypeProfile(type);
  const displayModelName = `${type.manufacturer ? `${type.manufacturer} ` : ""}${type.name}${
    type.model ? ` · ${type.model}` : ""
  }`;

  return (
    <PublicSiteChrome>
      <PublicPageHero title={displayModelName} subtitle={LOST_FOUND_SUBTITLE} />
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6 lg:px-8">
        <Card className="overflow-hidden border-primary/20">
          <CardContent className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Asset Record</p>
              <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{displayModelName}</p>
              <p className="text-sm text-muted-foreground">Category: {type.category}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Asset ID</p>
              <p className="font-mono text-base font-semibold">{data.assetId}</p>
              {data.serialNumber ? (
                <>
                  <p className="mt-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Serial</p>
                  <p className="font-mono text-sm">{data.serialNumber}</p>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>If found, please return</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data.lostFound.instructions ? (
              <div className="whitespace-pre-wrap">{data.lostFound.instructions}</div>
            ) : (
              <p className="text-muted-foreground">
                This equipment belongs to Arbor Live. If you found it, please contact us using the information below.
              </p>
            )}
            <div className="space-y-1">
              {data.lostFound.contactEmail ? (
                <p>
                  Email:{" "}
                  <a className="underline" href={`mailto:${data.lostFound.contactEmail}`}>
                    {data.lostFound.contactEmail}
                  </a>
                </p>
              ) : null}
              {data.lostFound.infoUrl ? (
                <p>
                  More info:{" "}
                  <a className="underline" href={data.lostFound.infoUrl} target="_blank">
                    {data.lostFound.infoUrl}
                  </a>
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {type.description || type.capabilities.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {type.description ? (
                <div>
                  <p className="text-sm font-medium">Description</p>
                  <MarkdownContent className="text-muted-foreground">{type.description}</MarkdownContent>
                </div>
              ) : null}

              {type.capabilities.length ? (
                <div>
                  <p className="text-sm font-medium">Capabilities</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {type.capabilities.map((key) => (
                      <span
                        key={key}
                        className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {labelByKey.get(key) ?? key}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {!showProfile ? (
          <Card>
            <CardHeader>
              <CardTitle>Product details are limited</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Detailed manuals, photos, and technical links are only shown when this model type is enabled for full public
              sharing.
            </CardContent>
          </Card>
        ) : null}

        {showProfile ? (
          <Card>
            <CardHeader>
              <CardTitle>Product details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {type.promoImageUrl ? (
                  <StoredAssetImage
                    storedValue={type.promoImageUrl}
                    alt="Promo"
                    className="w-full rounded-md border object-cover"
                  />
                ) : null}
                {type.iconImageUrl ? (
                  <StoredAssetImage
                    storedValue={type.iconImageUrl}
                    alt="Icon"
                    className="w-full rounded-md border object-contain bg-muted/30 p-4"
                  />
                ) : null}
              </div>

              {type.tips ? (
                <div>
                  <p className="text-sm font-medium">Tips</p>
                  <MarkdownContent className="text-muted-foreground">{type.tips}</MarkdownContent>
                </div>
              ) : null}

              {type.manualUrls?.length ? (
                <div>
                  <p className="text-sm font-medium">Manuals</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
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
                  <p className="text-sm font-medium">GDTF</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
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
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PublicSiteChrome>
  );
}

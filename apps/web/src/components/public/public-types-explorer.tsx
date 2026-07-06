"use client";

import { useMemo, useState } from "react";
import { OptimizedRemoteImage } from "@/components/media/optimized-remote-image";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
import { MarkdownContent } from "@/components/markdown-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/landing-motion";
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

export type PublicTypeRow = {
  bucket: PublicPackageBucket;
  type: PublicTypeSummary | PublicTypeProfile;
};

export type PublicCapabilityFilter = {
  key: string;
  label: string;
};

export function PublicTypesExplorer({
  rows,
  capabilityFilters,
  bucket,
}: {
  rows: PublicTypeRow[];
  capabilityFilters: PublicCapabilityFilter[];
  bucket?: PublicPackageBucket;
}) {
  const [capabilityKey, setCapabilityKey] = useState("");

  const labelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of capabilityFilters) {
      map.set(entry.key, entry.label);
    }
    return map;
  }, [capabilityFilters]);

  const filteredRows = useMemo(() => {
    const capFilter = capabilityKey.trim().toLowerCase();
    if (!capFilter) return rows;
    return rows.filter((row) => row.type.capabilities.includes(capFilter));
  }, [capabilityKey, rows]);

  const grouped = useMemo(() => {
    const ordered: PublicPackageBucket[] = [
      "lighting",
      "sound",
      "environmental",
      "staging",
      "misc",
    ];
    const map: Record<PublicPackageBucket, PublicTypeRow[]> = {
      lighting: [],
      sound: [],
      environmental: [],
      staging: [],
      misc: [],
    };

    for (const row of filteredRows) {
      map[row.bucket].push(row);
    }

    return ordered.map((key) => ({ key, items: map[key] }));
  }, [filteredRows]);

  return (
    <PublicSiteChrome>
      <PublicPageHero
        title={bucket ? `${bucketLabels[bucket]} model types` : "Model types"}
        subtitle={
          bucket
            ? `Reference specs for ${bucketLabels[bucket].toLowerCase()} equipment.`
            : "Browse publicly listed inventory model types and capabilities."
        }
      />
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="cap-filter">
            Filter by capability
          </label>
          <select
            id="cap-filter"
            className="h-9 max-w-xs rounded-md border bg-background px-3 text-sm"
            value={capabilityKey}
            onChange={(event) => setCapabilityKey(event.target.value)}
          >
            <option value="">All capabilities</option>
            {capabilityFilters.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {!filteredRows.length ? (
          <Card>
            <CardHeader>
              <CardTitle>No public types</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Ask an admin to enable public listing on inventory types, or try a different capability filter.
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-12">
          {grouped.map((group) => {
            if (!group.items.length) return null;

            return (
              <section key={group.key} className="space-y-4">
                <Reveal>
                  <h2 className="text-xl font-semibold tracking-tight">{bucketLabels[group.key]}</h2>
                </Reveal>

                <Stagger className="grid gap-6 md:grid-cols-2">
                  {group.items.map((row) => {
                    const type = row.type;
                    const hasProfile = isPublicTypeProfile(type);

                    return (
                      <StaggerItem key={type._id}>
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">{type.name}</CardTitle>
                            <p className="text-xs text-muted-foreground">
                              {hasProfile && type.model ? `Model: ${type.model}` : "Listed publicly"}
                            </p>
                          </CardHeader>
                          <CardContent className="space-y-3 text-sm">
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

                            {hasProfile ? (
                              <div className="grid gap-3 sm:grid-cols-2">
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
                            ) : (
                              <p className="text-muted-foreground">
                                This type is listed publicly, but detailed manuals/images are disabled.
                              </p>
                            )}

                            {hasProfile && type.tips ? (
                              <div>
                                <p className="text-sm font-medium">Tips</p>
                                <MarkdownContent className="text-muted-foreground">{type.tips}</MarkdownContent>
                              </div>
                            ) : null}

                            {hasProfile && type.manualUrls?.length ? (
                              <div>
                                <p className="text-sm font-medium">Manuals</p>
                                <ul className="mt-2 list-disc space-y-1 pl-5">
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

                            {hasProfile && type.categoryMetadata?.lighting?.gdtfUrls?.length ? (
                              <div>
                                <p className="text-sm font-medium">GDTF</p>
                                <ul className="mt-2 list-disc space-y-1 pl-5">
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
                      </StaggerItem>
                    );
                  })}
                </Stagger>
              </section>
            );
          })}
        </div>
      </div>
    </PublicSiteChrome>
  );
}

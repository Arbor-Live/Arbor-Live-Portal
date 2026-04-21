"use client";

/* eslint-disable @next/next/no-img-element -- public pages may reference arbitrary external image URLs */

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
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

export function PublicTypesExplorer({ bucket }: { bucket?: PublicBucket }) {
  const [capabilityKey, setCapabilityKey] = useState("");
  const capabilityFilters = useQuery(api.publicInventory.listPublicCapabilityFilters, {});
  const rows = useQuery(api.publicInventory.listPublicTypes, {
    ...(bucket ? { bucket } : {}),
    ...(capabilityKey ? { capability: capabilityKey } : {}),
  });

  const labelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of capabilityFilters ?? []) {
      map.set(entry.key, entry.label);
    }
    return map;
  }, [capabilityFilters]);

  const grouped = useMemo(() => {
    type Row = NonNullable<typeof rows>[number];
    const ordered: PublicBucket[] = ["lighting", "sound", "environmental", "staging", "misc"];
    const map: Record<PublicBucket, Row[]> = {
      lighting: [],
      sound: [],
      environmental: [],
      staging: [],
      misc: [],
    };

    for (const row of rows ?? []) {
      map[row.bucket as PublicBucket].push(row);
    }

    return ordered.map((key) => ({ key, items: map[key] }));
  }, [rows]);

  return (
    <PublicSiteChrome>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Model types</h1>
          <p className="text-sm text-muted-foreground">
            {bucket ? `${bucketLabels[bucket]} models.` : "Browse all publicly listed model types."}
          </p>
        </div>

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
            {(capabilityFilters ?? []).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {rows === undefined ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

        {rows && !rows.length ? (
          <Card>
            <CardHeader>
              <CardTitle>No public types</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Ask an admin to enable public listing on inventory types, or try a different capability filter.
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-10">
          {grouped.map((group) => {
            if (!group.items.length) return null;

            return (
              <section key={group.key} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{bucketLabels[group.key]}</h2>
                  <p className="text-xs text-muted-foreground">
                    Types are grouped using each category&apos;s configured public bucket (with sensible defaults).
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {group.items.map((row) => {
                    const type = row.type as PublicTypeSummary | PublicTypeProfile;
                    const hasProfile = isPublicTypeProfile(type);

                    return (
                      <Card key={type._id}>
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
                                <img
                                  src={type.promoImageUrl}
                                  alt=""
                                  className="h-32 w-full rounded-md border object-cover"
                                />
                              ) : null}
                              {type.iconImageUrl ? (
                                <img
                                  src={type.iconImageUrl}
                                  alt=""
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
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </PublicSiteChrome>
  );
}

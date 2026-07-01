"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { MarkdownContent } from "@/components/markdown-content";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { StoredAssetImage } from "@/components/files/stored-asset-image";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/landing-motion";
import { cn } from "@/lib/utils";

type PublicBucket = "lighting" | "sound" | "environmental" | "staging" | "misc";

const bucketLabels: Record<PublicBucket, string> = {
  lighting: "Lighting",
  sound: "Sound",
  environmental: "Environmental",
  staging: "Staging",
  misc: "Misc",
};

export function PublicPackagesExplorer({ bucket }: { bucket?: PublicBucket }) {
  const rows = useQuery(api.publicInventory.listPublicPackages, bucket ? { bucket } : {});

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
      <PublicPageHero
        title={bucket ? `${bucketLabels[bucket]} packages` : "Equipment packages"}
        subtitle={
          bucket
            ? `Browse ${bucketLabels[bucket].toLowerCase()} rental packages from Arbor Live.`
            : "Browse publicly listed equipment packages for your next event."
        }
      />
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
        {rows === undefined ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

        {rows && !rows.length ? (
          <Card>
            <CardHeader>
              <CardTitle>No public packages</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Ask an admin to enable public listing on a package.
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
                  {group.items.map((row, index) => (
                    <StaggerItem key={row.package._id}>
                      <Card className="group gap-0 overflow-hidden py-0 transition-shadow hover:ring-2 hover:ring-primary/20 has-[>div:first-child]:pt-0">
                        {row.package.publicHeroImageUrl ? (
                          <div className="relative h-44 w-full overflow-hidden border-b bg-zinc-950">
                            <StoredAssetImage
                              storedValue={row.package.publicHeroImageUrl}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                            <div
                              aria-hidden
                              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent"
                            />
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "flex h-32 items-center justify-center border-b px-4 text-center text-sm font-medium text-zinc-200",
                              index % 2 === 0
                                ? "bg-gradient-to-br from-emerald-900/60 via-primary/30 to-zinc-900"
                                : "bg-gradient-to-br from-zinc-900 via-primary/25 to-emerald-950",
                            )}
                          >
                            {row.package.name}
                          </div>
                        )}
                        <CardHeader className="gap-0.5 pb-2 pt-4">
                          <CardTitle className="text-balance text-base leading-snug">
                            {row.package.name}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            {bucketLabels[group.key]} package
                          </p>
                        </CardHeader>
                        <CardContent className="space-y-3 pb-4 pt-0 text-sm">
                          {row.package.description ? (
                            <div className="relative min-w-0">
                              <div className="max-h-32 overflow-hidden">
                                <MarkdownContent className="text-muted-foreground">
                                  {row.package.description}
                                </MarkdownContent>
                              </div>
                              {row.package.description.length > 160 ? (
                                <div
                                  aria-hidden
                                  className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"
                                />
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-muted-foreground">No description provided.</p>
                          )}
                          <Link
                            className="inline-flex text-sm font-medium text-primary hover:underline"
                            href={`/public/packages/view/${row.package._id}`}
                          >
                            View package →
                          </Link>
                        </CardContent>
                      </Card>
                    </StaggerItem>
                  ))}
                </Stagger>
              </section>
            );
          })}
        </div>
      </div>
    </PublicSiteChrome>
  );
}

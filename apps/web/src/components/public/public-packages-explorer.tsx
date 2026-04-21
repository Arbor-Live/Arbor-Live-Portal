"use client";

/* eslint-disable @next/next/no-img-element -- public pages may reference arbitrary external image URLs */

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { MarkdownContent } from "@/components/markdown-content";
import { PublicSiteChrome } from "@/components/public/public-site-chrome";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Packages</h1>
          <p className="text-sm text-muted-foreground">
            {bucket ? `${bucketLabels[bucket]} equipment packages.` : "Browse all publicly listed packages."}
          </p>
        </div>

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

        <div className="space-y-10">
          {grouped.map((group) => {
            if (!group.items.length) return null;

            return (
              <section key={group.key} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{bucketLabels[group.key]}</h2>
                  <p className="text-xs text-muted-foreground">
                    Packages are grouped by their dominant equipment category.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {group.items.map((row) => (
                    <Card key={row.package._id} className="overflow-hidden">
                      {row.package.publicHeroImageUrl ? (
                        <img
                          src={row.package.publicHeroImageUrl}
                          alt=""
                          className="h-40 w-full object-cover"
                        />
                      ) : (
                        <div className="h-40 w-full bg-muted/40" />
                      )}
                      <CardHeader>
                        <CardTitle className="text-base">{row.package.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="max-h-32 overflow-hidden text-muted-foreground">
                          {row.package.description ? (
                            <MarkdownContent>{row.package.description}</MarkdownContent>
                          ) : (
                            <p>No description provided.</p>
                          )}
                        </div>
                        <Link
                          className="text-sm font-medium underline"
                          href={`/public/packages/view/${row.package._id}`}
                        >
                          View package
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </PublicSiteChrome>
  );
}

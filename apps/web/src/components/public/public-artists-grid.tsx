"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { StoredAssetImage } from "@/components/files/stored-asset-image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/landing/landing-motion";
import { cn } from "@/lib/utils";

const gradients = [
  "from-emerald-900/80 via-primary/40 to-zinc-900",
  "from-violet-950/80 via-primary/25 to-zinc-900",
  "from-amber-900/70 via-primary/35 to-zinc-900",
  "from-zinc-900 via-primary/30 to-emerald-950",
];

export function PublicArtistsGrid() {
  const artists = useQuery(api.publicDirectory.listPublicArtists, {});

  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {artists === undefined ? (
          <p className="text-sm text-muted-foreground">Loading artists…</p>
        ) : null}

        {artists && artists.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No public artists yet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Bands can enable a public profile from the portal to appear here.
            </CardContent>
          </Card>
        ) : null}

        {artists && artists.length > 0 ? (
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {artists.map((artist, index) => (
              <StaggerItem key={artist.slug}>
                <Link href={`/artists/${artist.slug}`} className="group block h-full">
                  <Card className="h-full gap-0 overflow-hidden border border-border py-0 shadow-sm ring-0 transition-[border-color,box-shadow] group-hover:border-primary/40 group-hover:shadow-md">
                    <div
                      className={cn(
                        "relative h-36 bg-gradient-to-br",
                        gradients[index % gradients.length],
                      )}
                    >
                      {artist.heroImageUrl ? (
                        <StoredAssetImage
                          storedValue={artist.heroImageUrl}
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 to-transparent" />
                    </div>
                    <CardHeader>
                      <CardTitle className="text-lg">{artist.displayName}</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-6">
                      {artist.bioExcerpt ? (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {artist.bioExcerpt}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">View profile</p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        ) : null}
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/landing-motion";
import { PublicArtistPoster } from "@/components/public/public-artist-poster";
import { MarketingLinkIcon } from "@/lib/marketing-link-icons";

function ArtistCardSkeleton() {
  return (
    <Card className="h-full gap-0 overflow-hidden border border-border/50 bg-background/70 py-0 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl ring-0">
      <Skeleton className="aspect-[4/5] w-full rounded-none" />
      <CardContent className="space-y-2 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}

export function PublicArtistsGrid() {
  const artists = useQuery(api.publicDirectory.listPublicArtists, {});

  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {artists === undefined ? (
          <div
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            role="status"
            aria-label="Loading artists"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <ArtistCardSkeleton key={index} />
            ))}
            <span className="sr-only">Loading artists…</span>
          </div>
        ) : null}

        {artists && artists.length === 0 ? (
          <div className="mx-auto max-w-xl border border-border/50 bg-background/70 px-6 py-10 text-center shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl sm:px-8">
            <p className="font-heading text-xl font-semibold tracking-tight">No public profiles yet</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Be the first — join the live music community at Stanford!
            </p>
            <Button asChild className="mt-6" size="lg">
              <Link href="/artists/apply">Join the community</Link>
            </Button>
          </div>
        ) : null}

        {artists && artists.length > 0 ? (
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {artists.map((artist) => {
              const socialLinks = (artist.links ?? []).map((link) => ({
                label: link.label,
                url: link.url,
                icon: link.icon ?? "LinkSimple",
              }));
              return (
                <StaggerItem key={artist.slug}>
                  <Reveal>
                    <Card className="relative h-full gap-0 overflow-hidden border border-border/50 bg-background/70 py-0 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl ring-0 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)]">
                      <PublicArtistPoster
                        imageUrl={artist.heroImageUrl}
                        seed={artist.slug}
                        title={artist.displayName}
                        className="w-full"
                      />
                      <CardContent className="space-y-2 p-4">
                        <h3 className="font-semibold text-foreground">{artist.displayName}</h3>
                        {artist.oneLiner ? (
                          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                            {artist.oneLiner}
                          </p>
                        ) : artist.bioExcerpt ? (
                          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                            {artist.bioExcerpt}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">View profile</p>
                        )}
                        {artist.genres.length > 0 ? (
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {artist.genres.join(" · ")}
                          </p>
                        ) : null}
                        {socialLinks.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                            {socialLinks.map((link) => (
                              <a
                                key={`${artist.slug}-${link.url}`}
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="relative z-10 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                              >
                                <MarketingLinkIcon id={link.icon} className="size-3.5 shrink-0" />
                                {link.label}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </CardContent>
                      <Link
                        href={`/artists/${artist.slug}`}
                        aria-label={`View ${artist.displayName}`}
                        className="absolute inset-0 z-0 rounded-none"
                      />
                    </Card>
                  </Reveal>
                </StaggerItem>
              );
            })}
          </Stagger>
        ) : null}
      </div>
    </section>
  );
}

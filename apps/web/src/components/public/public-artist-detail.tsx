"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Reveal } from "@/components/landing/landing-motion";
import { cn } from "@/lib/utils";

export function PublicArtistDetail({ slug }: { slug: string }) {
  const artist = useQuery(api.publicDirectory.getPublicArtistBySlug, { slug });

  if (artist === undefined) {
    return <p className="text-sm text-muted-foreground">Loading artist…</p>;
  }

  if (artist === null) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-semibold">Artist not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This profile may be private or no longer available.
        </p>
        <Link href="/artists" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
          Back to artists
        </Link>
      </div>
    );
  }

  return (
    <article>
      <section className="relative overflow-hidden border-b bg-zinc-950 text-zinc-50">
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 bg-gradient-to-br from-emerald-900/80 via-primary/40 to-zinc-900",
            artist.heroImageUrl && "opacity-40",
          )}
        />
        {artist.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artist.heroImageUrl}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-50"
          />
        ) : null}
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <Reveal>
            <Link
              href="/artists"
              className="text-sm text-zinc-300 hover:text-white hover:underline"
            >
              ← All artists
            </Link>
            <h1 className="display-tight mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
              {artist.displayName}
            </h1>
          </Reveal>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            {artist.bio ? (
              <p className="text-base leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {artist.bio}
              </p>
            ) : (
              <p className="text-muted-foreground">No bio yet.</p>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              {artist.websiteUrl ? (
                <a
                  href={artist.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-none border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Website ↗
                </a>
              ) : null}
              {artist.instagramUrl ? (
                <a
                  href={artist.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-none border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Instagram ↗
                </a>
              ) : null}
              {artist.youtubeUrl ? (
                <a
                  href={artist.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-none border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  YouTube ↗
                </a>
              ) : null}
            </div>
          </Reveal>
        </div>
      </section>
    </article>
  );
}

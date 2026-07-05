"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { StoredAssetImage } from "@/components/files/stored-asset-image";
import { Reveal } from "@/components/landing/landing-motion";
import { formatWorkPostDate, WorkPostKindBadge, workPostGradient } from "@/components/marketing/work-post-ui";
import { cn } from "@/lib/utils";

export function LandingWorkCarousel() {
  const posts = useQuery(api.publicMarketing.listFeaturedPosts, {});

  if (posts === undefined || posts.length === 0) {
    return null;
  }

  return (
    <section className="border-b bg-background py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="display-tight text-3xl font-semibold tracking-tight sm:text-4xl">
              You&apos;re in good company
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
              Whether it's a small house event or a full production, we are ready to help you every step of the way.
            </p>
          </div>
          <Link href="/work" className="text-sm font-medium text-primary hover:underline">
            View all work →
          </Link>
        </Reveal>

        <div className="mt-8 -mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex snap-x snap-mandatory gap-4">
            {posts.map((post, index) => (
              <Link
                key={post.slug}
                href={`/work/${post.slug}`}
                className="group w-[min(100%,320px)] shrink-0 snap-start sm:w-[340px]"
              >
                <article className="h-full overflow-hidden border bg-card transition-shadow group-hover:ring-2 group-hover:ring-primary/30">
                  <div
                    className={cn(
                      "relative h-40 bg-gradient-to-br",
                      workPostGradient(index),
                    )}
                  >
                    {post.heroImageUrl ? (
                      <StoredAssetImage
                        storedValue={post.heroImageUrl}
                        className="absolute inset-0 size-full object-cover"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/75 to-transparent" />
                    <div className="absolute bottom-3 left-3">
                      <WorkPostKindBadge kind={post.kind} />
                    </div>
                  </div>
                  <div className="space-y-2 p-4">
                    <p className="text-xs text-muted-foreground">
                      {formatWorkPostDate(post.publishedAt)}
                    </p>
                    <h3 className="text-lg font-semibold leading-snug">{post.title}</h3>
                    {post.excerpt ? (
                      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                        {post.excerpt}
                      </p>
                    ) : null}
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

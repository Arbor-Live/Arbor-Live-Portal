"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { LexicalViewer } from "@/components/editor/lexical-viewer";
import { StoredAssetImage } from "@/components/files/stored-asset-image";
import { Reveal } from "@/components/landing/landing-motion";
import {
  formatWorkPostDate,
  WorkPostKindBadge,
} from "@/components/marketing/work-post-ui";
import { WorkFeaturedStats } from "@/components/marketing/work-featured-stats";
import { cn } from "@/lib/utils";

export function PublicWorkDetail({ slug }: { slug: string }) {
  const post = useQuery(api.publicMarketing.getPublishedPostBySlug, { slug });

  if (post === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (post === null) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-semibold">Post not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This story may be unpublished or no longer available.
        </p>
        <Link href="/work" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
          Back to all work
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
            post.heroImageUrl && "opacity-40",
          )}
        />
        {post.heroImageUrl ? (
          <StoredAssetImage
            storedValue={post.heroImageUrl}
            className="absolute inset-0 size-full object-cover opacity-50"
          />
        ) : null}
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <Reveal>
            <Link
              href="/work"
              className="text-sm text-zinc-300 hover:text-white hover:underline"
            >
              ← All work
            </Link>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <WorkPostKindBadge kind={post.kind} />
              <span className="text-sm text-zinc-300">
                {formatWorkPostDate(post.publishedAt)}
              </span>
            </div>
            <h1 className="display-tight mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              {post.title}
            </h1>
            {post.excerpt ? (
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-200 sm:text-lg">
                {post.excerpt}
              </p>
            ) : null}
            <WorkFeaturedStats stats={post.featuredStats} variant="dark" />
          </Reveal>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <LexicalViewer contentJson={post.contentJson} />
          </Reveal>
        </div>
      </section>
    </article>
  );
}

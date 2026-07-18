"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StoredAssetImage } from "@/components/files/stored-asset-image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/landing/landing-motion";
import {
  formatWorkPostDate,
  WorkPostKindBadge,
  workPostGradient,
} from "@/components/marketing/work-post-ui";
import { cn } from "@/lib/utils";
import type { PublicWorkPostCard } from "@/lib/public-marketing-types";
import type { MarketingPostKind } from "@/lib/validations/marketing";

const ALL_FILTER = "all" as const;

export function PublicWorkGrid({ posts }: { posts: PublicWorkPostCard[] }) {
  const [kindFilter, setKindFilter] = useState<typeof ALL_FILTER | MarketingPostKind>(ALL_FILTER);

  const filteredPosts = useMemo(() => {
    if (kindFilter === ALL_FILTER) return posts;
    return posts.filter((post) => post.kind === kindFilter);
  }, [kindFilter, posts]);

  const filters = useMemo(
    () =>
      [
        { id: ALL_FILTER, label: "All" },
        { id: "case_study" as const, label: "Case studies" },
        { id: "blog" as const, label: "Blog" },
      ] as const,
    [],
  );

  return (
    <section className="bg-muted/35 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setKindFilter(filter.id)}
              className={cn(
                "rounded-none border px-3 py-1.5 text-sm font-medium transition-colors",
                kindFilter === filter.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-foreground/15 bg-card text-foreground hover:bg-muted",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {filteredPosts.length === 0 ? (
          <Card className="border border-border shadow-sm ring-0">
            <CardHeader>
              <CardTitle>Coming soon</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-foreground/70">
              Case studies and blog posts will appear here once published from the dashboard.
            </CardContent>
          </Card>
        ) : (
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map((post, index) => (
              <StaggerItem key={post.slug}>
                <Link href={`/work/${post.slug}`} className="group block h-full">
                  <Card className="h-full gap-0 overflow-hidden border border-border py-0 shadow-sm ring-0 transition-[border-color,box-shadow] group-hover:border-primary/40 group-hover:shadow-md">
                    <div
                      className={cn(
                        "relative h-36 bg-gradient-to-br",
                        workPostGradient(index),
                      )}
                    >
                      {post.heroImageUrl ? (
                        <StoredAssetImage
                          storedValue={post.heroImageUrl}
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 to-transparent" />
                      <div className="absolute bottom-3 left-3">
                        <WorkPostKindBadge kind={post.kind} />
                      </div>
                    </div>
                    <CardHeader>
                      <p className="text-xs font-medium text-foreground/60">
                        {formatWorkPostDate(post.publishedAt)}
                      </p>
                      <CardTitle className="text-lg text-foreground">{post.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-6">
                      {post.excerpt ? (
                        <p className="text-sm leading-relaxed text-foreground/70">
                          {post.excerpt}
                        </p>
                      ) : (
                        <p className="text-sm text-foreground/70">Read more</p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </section>
  );
}

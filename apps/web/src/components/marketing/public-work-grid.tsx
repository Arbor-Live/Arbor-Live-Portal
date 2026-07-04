"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { StoredAssetImage } from "@/components/files/stored-asset-image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/landing/landing-motion";
import {
  formatWorkPostDate,
  WorkPostKindBadge,
  workPostGradient,
} from "@/components/marketing/work-post-ui";
import { cn } from "@/lib/utils";
import type { MarketingPostKind } from "@/lib/validations/marketing";

const ALL_FILTER = "all" as const;

export function PublicWorkGrid() {
  const [kindFilter, setKindFilter] = useState<typeof ALL_FILTER | MarketingPostKind>(ALL_FILTER);
  const posts = useQuery(
    api.publicMarketing.listPublishedPosts,
    kindFilter === ALL_FILTER ? {} : { kind: kindFilter },
  );

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
    <section className="py-12 sm:py-16">
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
                  : "bg-card text-foreground hover:bg-muted",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {posts === undefined ? (
          <p className="text-sm text-muted-foreground">Loading work…</p>
        ) : null}

        {posts && posts.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Coming soon</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Case studies and blog posts will appear here once published from the dashboard.
            </CardContent>
          </Card>
        ) : null}

        {posts && posts.length > 0 ? (
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <StaggerItem key={post.slug}>
                <Link href={`/work/${post.slug}`} className="group block h-full">
                  <Card className="h-full overflow-hidden py-0 transition-shadow group-hover:ring-2 group-hover:ring-primary/30">
                    <div
                      className={cn(
                        "relative h-36 bg-gradient-to-br",
                        workPostGradient(index),
                      )}
                    >
                      {post.heroImageUrl ? (
                        <StoredAssetImage
                          storedValue={post.heroImageUrl}
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 to-transparent" />
                      <div className="absolute bottom-3 left-3">
                        <WorkPostKindBadge kind={post.kind} />
                      </div>
                    </div>
                    <CardHeader>
                      <p className="text-xs text-muted-foreground">
                        {formatWorkPostDate(post.publishedAt)}
                      </p>
                      <CardTitle className="text-lg">{post.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-6">
                      {post.excerpt ? (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {post.excerpt}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Read more</p>
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

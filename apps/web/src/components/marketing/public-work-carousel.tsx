import Link from "next/link";
import { OptimizedRemoteImage } from "@/components/media/optimized-remote-image";
import { Reveal } from "@/components/landing/landing-motion";
import { formatWorkPostDate, WorkPostKindBadge, workPostGradient } from "@/components/marketing/work-post-ui";
import { cn } from "@/lib/utils";
import type { PublicWorkPostCard } from "@/lib/public-marketing-types";

export function LandingWorkCarousel({ posts }: { posts: PublicWorkPostCard[] }) {
  if (!posts.length) {
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
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/70">
              Whether it&apos;s a small house event or a full production, we are ready to help you every step of the way.
            </p>
          </div>
          <Link href="/work" className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-primary">
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
                <article className="h-full overflow-hidden border border-foreground/12 bg-card shadow-sm transition-shadow group-hover:ring-2 group-hover:ring-primary/30">
                  <div
                    className={cn(
                      "relative h-40 bg-gradient-to-br",
                      workPostGradient(index),
                    )}
                  >
                    {post.heroImageUrl ? (
                      <OptimizedRemoteImage
                        src={post.heroImageUrl}
                        alt=""
                        fill
                        sizes="340px"
                        className="absolute inset-0 size-full object-cover"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/75 to-transparent" />
                    <div className="absolute bottom-3 left-3">
                      <WorkPostKindBadge kind={post.kind} />
                    </div>
                  </div>
                  <div className="space-y-2 p-4">
                    <p className="text-xs font-medium text-foreground/60">
                      {formatWorkPostDate(post.publishedAt)}
                    </p>
                    <h3 className="text-lg font-semibold leading-snug text-foreground">{post.title}</h3>
                    {post.excerpt ? (
                      <p className="line-clamp-3 text-sm leading-relaxed text-foreground/70">
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

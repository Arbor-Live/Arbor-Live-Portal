import { HashLive } from "@/components/hashing/live/hash-live";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import type { Id } from "@/lib/convex-api";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Hash",
};

export default async function HashPage({ params }: { params: Promise<{ hashId: string }> }) {
  const { hashId } = await params;
  return (
    <ArborOnlyGuard>
      {/* The open area lives in a search param, which needs a Suspense boundary. */}
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <HashLive hashDateId={hashId as Id<"hashDates">} />
      </Suspense>
    </ArborOnlyGuard>
  );
}

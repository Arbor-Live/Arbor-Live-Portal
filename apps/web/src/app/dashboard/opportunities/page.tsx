import { Suspense } from "react";
import { BandOnlyGuard } from "@/components/org-context-guard";
import { ArtistOpportunitiesClient } from "@/components/bands/artist-opportunities-client";
import { Skeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Opportunities",
};

export default function ArtistOpportunitiesPage() {
  // The client reads `?position=` with useSearchParams, which requires a
  // Suspense boundary in a production build.
  return (
    <BandOnlyGuard>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <ArtistOpportunitiesClient />
      </Suspense>
    </BandOnlyGuard>
  );
}

import { Suspense } from "react";
import { BandOnlyGuard } from "@/components/org-context-guard";
import { ArtistOpportunitiesClient } from "@/components/bands/artist-opportunities-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Opportunities",
};

export default function ArtistOpportunitiesPage() {
  // The client reads `?position=` with useSearchParams, which requires a
  // Suspense boundary in a production build.
  return (
    <BandOnlyGuard>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading opportunities…</p>}>
        <ArtistOpportunitiesClient />
      </Suspense>
    </BandOnlyGuard>
  );
}

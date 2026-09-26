"use client";

import { BandOnlyGuard } from "@/components/org-context-guard";
import { ArtistOpportunitiesClient } from "@/components/bands/artist-opportunities-client";

export default function ArtistOpportunitiesPage() {
  return (
    <BandOnlyGuard>
      <ArtistOpportunitiesClient />
    </BandOnlyGuard>
  );
}

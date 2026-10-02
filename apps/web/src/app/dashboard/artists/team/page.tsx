import { BandOnlyGuard } from "@/components/org-context-guard";
import { BandTeamClient } from "@/components/bands/band-team-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Artist team",
};

export default function BandTeamPage() {
  return (
    <BandOnlyGuard>
      <BandTeamClient />
    </BandOnlyGuard>
  );
}

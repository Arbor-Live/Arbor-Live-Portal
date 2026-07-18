import { ArtistsJoinSection } from "@/components/public/artists-join-section";
import { PublicArtistsGrid } from "@/components/public/public-artists-grid";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicPageHero } from "@/components/public/public-page-hero";

export const metadata = {
  title: "Artists | Arbor Live",
  description: "Discover bands and performers working with Arbor Live.",
};

export default function ArtistsPage() {
  return (
    <PublicMarketingLayout>
      <PublicPageHero
        title="Artists"
        subtitle="Stanford bands and performers working with Arbor Live — browse profiles and connect."
      />
      <PublicArtistsGrid />
      <ArtistsJoinSection />
    </PublicMarketingLayout>
  );
}

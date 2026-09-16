import { ArtistsJoinSection } from "@/components/public/artists-join-section";
import { PublicArtistsGrid } from "@/components/public/public-artists-grid";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicPageHero } from "@/components/public/public-page-hero";

export const metadata = {
  title: "Artists | Arbor Live",
  description: "Discover artists and performers working with Arbor Live.",
};

export default function ArtistsPage() {
  return (
    <PublicMarketingLayout>
      <PublicPageHero
        title="Artists"
        subtitle="Stanford is full of creative and talented artists — Arbor is a community where every musician and artist is welcome."
      />
      <PublicArtistsGrid />
      <ArtistsJoinSection />
    </PublicMarketingLayout>
  );
}

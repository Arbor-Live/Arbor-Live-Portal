import { PublicArtistsGrid } from "@/components/public/public-artists-grid";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { isAuthenticated } from "@/lib/auth-server";

export const metadata = {
  title: "Artists | Arbor Live",
  description: "Discover bands and performers working with Arbor Live.",
};

export default async function ArtistsPage() {
  const authed = await isAuthenticated();

  return (
    <PublicMarketingLayout showDashboardLink={authed}>
      <PublicPageHero
        title="Artists"
        subtitle="Stanford bands and performers — browse profiles and connect."
      />
      <PublicArtistsGrid />
    </PublicMarketingLayout>
  );
}

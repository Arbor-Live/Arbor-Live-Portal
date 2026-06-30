import { PublicCrewGrid } from "@/components/public/public-crew-grid";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { isAuthenticated } from "@/lib/auth-server";

export const metadata = {
  title: "The Team | Arbor Live",
  description: "Meet the Arbor Live student production crew.",
};

export default async function CrewPage() {
  const authed = await isAuthenticated();

  return (
    <PublicMarketingLayout showDashboardLink={authed}>
      <PublicPageHero
        title="The Team"
        subtitle="Student producers powering live events across Stanford — sound, lights, design, marketing, and operations."
      />
      <PublicCrewGrid />
    </PublicMarketingLayout>
  );
}

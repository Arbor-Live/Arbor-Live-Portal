import { CrewJoinSection } from "@/components/public/crew-join-section";
import { PublicCrewGrid } from "@/components/public/public-crew-grid";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicPageHero } from "@/components/public/public-page-hero";

export const metadata = {
  title: "The Team | Arbor Live",
  description: "Meet the Arbor Live student production crew.",
};

export default function CrewPage() {
  return (
    <PublicMarketingLayout>
      <PublicPageHero
        title="The Team"
        subtitle="Student producers powering live events across Stanford — sound, lights, design, marketing, and operations."
      />
      <PublicCrewGrid />
      <CrewJoinSection />
    </PublicMarketingLayout>
  );
}

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
        subtitle="The students who run sound, lights, and every Arbor show."
      />
      <PublicCrewGrid />
      <CrewJoinSection />
    </PublicMarketingLayout>
  );
}

import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { ArtistsJoinSection } from "@/components/public/artists-join-section";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { BandApplicationForm } from "@/components/public/band-application-form";

export const metadata = {
  title: "Join as an artist",
  description: "Join the live music community at Stanford with Arbor Live.",
};

export default function ArtistsApplyPage() {
  return (
    <PublicMarketingLayout>
      <PublicPageHero
        title="Join the community"
        subtitle="Play shows, meet musicians, and get paid."
      />
      <ArtistsJoinSection cta={{ label: "Start your application", href: "#apply" }} />
      <section
        id="apply"
        className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8"
      >
        <BandApplicationForm />
      </section>
    </PublicMarketingLayout>
  );
}

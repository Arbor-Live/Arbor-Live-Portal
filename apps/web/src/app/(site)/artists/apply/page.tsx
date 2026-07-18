import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { BandApplicationForm } from "@/components/public/band-application-form";

export const metadata = {
  title: "Join as an artist | Arbor Live",
  description: "Join the live music community at Stanford with Arbor Live.",
};

export default function ArtistsApplyPage() {
  return (
    <PublicMarketingLayout>
      <PublicPageHero
        title="Join the community"
        subtitle="Join and become a part of the live music community at Stanford!"
      />
      <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <BandApplicationForm />
      </section>
    </PublicMarketingLayout>
  );
}

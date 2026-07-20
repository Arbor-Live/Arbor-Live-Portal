import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { CrewApplicationForm } from "@/components/public/crew-application-form";

export const metadata = {
  title: "Join the crew | Arbor Live",
  description: "Apply to join the Arbor Live crew at Stanford.",
};

export default function CrewApplyPage() {
  return (
    <PublicMarketingLayout>
      <PublicPageHero
        title="Join the crew"
        subtitle="Join and become a part of the live music community at Stanford!"
      />
      <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <CrewApplicationForm />
      </section>
    </PublicMarketingLayout>
  );
}

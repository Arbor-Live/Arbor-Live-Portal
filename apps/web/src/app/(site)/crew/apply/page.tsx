import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { CrewJoinSection } from "@/components/public/crew-join-section";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { CrewApplicationForm } from "@/components/public/crew-application-form";

export const metadata = {
  title: "Join the crew",
  description: "Apply to join the Arbor Live crew at Stanford.",
};

export default function CrewApplyPage() {
  return (
    <PublicMarketingLayout>
      <PublicPageHero
        title="Join the crew"
        subtitle="Learn live production and work real shows."
      />
      <CrewJoinSection cta={{ label: "Start your application", href: "#apply" }} />
      <section
        id="apply"
        className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8"
      >
        <CrewApplicationForm />
      </section>
    </PublicMarketingLayout>
  );
}

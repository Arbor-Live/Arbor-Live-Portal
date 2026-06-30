import { LandingCtaBand } from "@/components/landing/landing-cta-band";
import { LandingEventTypes } from "@/components/landing/landing-event-types";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingLayout } from "@/components/landing/landing-layout";
import { LandingPrograms } from "@/components/landing/landing-programs";
import { LandingStats } from "@/components/landing/landing-stats";
import { isAuthenticated } from "@/lib/auth-server";

export default async function Home() {
  const authed = await isAuthenticated();

  return (
    <LandingLayout showDashboardLink={authed}>
      <LandingHero />
      <LandingPrograms />
      <LandingStats />
      <LandingEventTypes />
      <LandingFaq />
      <LandingCtaBand />
    </LandingLayout>
  );
}

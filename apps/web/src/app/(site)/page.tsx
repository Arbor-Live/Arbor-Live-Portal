import { LandingCtaBand } from "@/components/landing/landing-cta-band";
import { LandingEventTypes } from "@/components/landing/landing-event-types";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingLayout } from "@/components/landing/landing-layout";
import { LandingPrograms } from "@/components/landing/landing-programs";
import { LandingStats } from "@/components/landing/landing-stats";
import { LandingWorkCarousel } from "@/components/marketing/public-work-carousel";
import { api } from "@/lib/convex-api";
import { fetchPublicQuery } from "@/lib/convex-server";
export const revalidate = 3600;

export default async function Home() {
  const featuredPosts = await fetchPublicQuery(api.publicMarketing.listFeaturedPosts, {});

  return (
    <LandingLayout>
      <LandingHero />
      <LandingWorkCarousel posts={featuredPosts} />
      <LandingPrograms />
      <LandingStats />
      <LandingEventTypes />
      <LandingFaq />
      <LandingCtaBand />
    </LandingLayout>
  );
}

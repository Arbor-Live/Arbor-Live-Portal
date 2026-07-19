import { LandingCtaBand } from "@/components/landing/landing-cta-band";
import { LandingEventTypes } from "@/components/landing/landing-event-types";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingLayout } from "@/components/landing/landing-layout";
import { LandingPrograms } from "@/components/landing/landing-programs";
import { LandingStats } from "@/components/landing/landing-stats";
import { LandingUpcomingEventsSection } from "@/components/public/public-events-grid";
import { LandingWorkCarousel } from "@/components/marketing/public-work-carousel";
import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";

export const revalidate = 3600;

export default async function Home() {
  const [featuredPosts, upcomingEvents] = await Promise.all([
    fetchPublicQuerySafe(api.publicMarketing.listFeaturedPosts, {}, []),
    fetchPublicQuerySafe(
      api.publicEvents.listUpcoming,
      { now: Date.now(), limit: 10 },
      [],
    ),
  ]);

  return (
    <LandingLayout>
      <LandingHero />
      <LandingUpcomingEventsSection events={upcomingEvents} />
      <LandingWorkCarousel posts={featuredPosts} />
      <LandingPrograms />
      <LandingStats />
      <LandingEventTypes />
      <LandingFaq />
      <LandingCtaBand />
    </LandingLayout>
  );
}

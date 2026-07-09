import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { PublicUpcomingEventsClient } from "@/components/public/public-upcoming-events-client";

export const metadata = {
  title: "Upcoming Events | Arbor Live",
  description: "Upcoming public events from Arbor Live.",
};

export default function EventsPage() {
  return (
    <PublicMarketingLayout>
      <PublicPageHero
        title="Upcoming events"
        subtitle="Confirmed public events from Arbor Live — posters, details, and links."
      />
      <section className="pb-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <PublicUpcomingEventsClient />
        </div>
      </section>
    </PublicMarketingLayout>
  );
}

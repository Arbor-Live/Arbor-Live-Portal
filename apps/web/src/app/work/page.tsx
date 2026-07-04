import { PublicWorkGrid } from "@/components/marketing/public-work-grid";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { isAuthenticated } from "@/lib/auth-server";

export const metadata = {
  title: "Our Work | Arbor Live",
  description: "Case studies and stories from live events produced by Arbor Live.",
};

export default async function WorkPage() {
  const authed = await isAuthenticated();

  return (
    <PublicMarketingLayout showDashboardLink={authed}>
      <PublicPageHero
        title="Our Work"
        subtitle="Case studies and blog posts from events we've produced across campus."
      />
      <PublicWorkGrid />
    </PublicMarketingLayout>
  );
}

import { PublicWorkGrid } from "@/components/marketing/public-work-grid";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicPageHero } from "@/components/public/public-page-hero";
import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";
export const revalidate = 3600;

export const metadata = {
  title: "Our Work | Arbor Live",
  description: "Case studies and stories from live events produced by Arbor Live.",
};

export default async function WorkPage() {
  const posts = await fetchPublicQuerySafe(api.publicMarketing.listPublishedPosts, {}, []);

  return (
    <PublicMarketingLayout>
      <PublicPageHero
        title="Our Work"
        subtitle="Case studies and blog posts from events we've produced across campus."
      />
      <PublicWorkGrid posts={posts} />
    </PublicMarketingLayout>
  );
}

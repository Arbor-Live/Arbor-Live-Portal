import { PublicWorkDetail } from "@/components/marketing/public-work-detail";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { isAuthenticated } from "@/lib/auth-server";

type WorkDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: WorkDetailPageProps) {
  const { slug } = await params;
  return {
    title: `${slug.replace(/-/g, " ")} | Arbor Live`,
    description: "Case study or blog post from Arbor Live.",
  };
}

export default async function WorkDetailPage({ params }: WorkDetailPageProps) {
  const authed = await isAuthenticated();
  const { slug } = await params;

  return (
    <PublicMarketingLayout showDashboardLink={authed}>
      <PublicWorkDetail slug={slug} />
    </PublicMarketingLayout>
  );
}

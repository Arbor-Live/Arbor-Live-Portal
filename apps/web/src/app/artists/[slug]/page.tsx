import type { Metadata } from "next";
import { PublicArtistDetail } from "@/components/public/public-artist-detail";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { isAuthenticated } from "@/lib/auth-server";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const title = slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return {
    title: `${title} | Arbor Live`,
    description: `Artist profile for ${title} on Arbor Live.`,
  };
}

export default async function ArtistDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const authed = await isAuthenticated();

  return (
    <PublicMarketingLayout showDashboardLink={authed}>
      <PublicArtistDetail slug={slug} />
    </PublicMarketingLayout>
  );
}

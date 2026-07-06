import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicWorkDetailContent } from "@/components/marketing/public-work-detail-content";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { api } from "@/lib/convex-api";
import { fetchPublicQuery } from "@/lib/convex-server";
export const revalidate = 3600;
export const dynamicParams = true;

type WorkDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await fetchPublicQuery(api.publicMarketing.listPublishedSlugs, {});
  return slugs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: WorkDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPublicQuery(api.publicMarketing.getPublishedPostBySlug, { slug });

  if (!post) {
    return {
      title: "Post not found | Arbor Live",
      description: "Case study or blog post from Arbor Live.",
    };
  }

  return {
    title: `${post.title} | Arbor Live`,
    description: post.excerpt ?? "Case study or blog post from Arbor Live.",
  };
}

export default async function WorkDetailPage({ params }: WorkDetailPageProps) {
  const { slug } = await params;
  const post = await fetchPublicQuery(api.publicMarketing.getPublishedPostBySlug, { slug });

  if (!post) {
    notFound();
  }

  return (
    <PublicMarketingLayout>
      <PublicWorkDetailContent post={post} />
    </PublicMarketingLayout>
  );
}

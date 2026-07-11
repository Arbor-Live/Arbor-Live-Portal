import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicWorkDetailContent } from "@/components/marketing/public-work-detail-content";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";
import {
  formatPublicWorkPageTitle,
  getPublicWorkPostBySlug,
} from "@/lib/public-work-post";

export const revalidate = 3600;
export const dynamicParams = true;

type WorkDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const posts = await fetchPublicQuerySafe(
    api.publicMarketing.listPublishedPosts,
    {},
    [],
  );
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: WorkDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublicWorkPostBySlug(slug);

  if (!post) {
    return {
      title: "Post not found | Arbor Live",
      description: "Case study or blog post from Arbor Live.",
    };
  }

  const description = post.excerpt ?? "Case study or blog post from Arbor Live.";

  return {
    title: formatPublicWorkPageTitle(post.title),
    description,
    openGraph: {
      title: post.title,
      description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
    },
  };
}

export default async function WorkDetailPage({ params }: WorkDetailPageProps) {
  const { slug } = await params;
  const post = await getPublicWorkPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <PublicMarketingLayout>
      <PublicWorkDetailContent post={post} />
    </PublicMarketingLayout>
  );
}

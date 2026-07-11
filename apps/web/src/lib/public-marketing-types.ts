export type PublicWorkPostCard = {
  slug: string;
  title: string;
  excerpt?: string;
  kind: "case_study" | "blog";
  heroImageUrl?: string;
  publishedAt: number;
};

export type PublicWorkPostDetail = PublicWorkPostCard & {
  featuredStats: Array<{ label: string; value: string }>;
  contentJson: string;
};

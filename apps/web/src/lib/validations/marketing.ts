import { z } from "zod";

export const marketingPostKindSchema = z.enum(["case_study", "blog"]);

export type MarketingPostKind = z.infer<typeof marketingPostKindSchema>;

export const marketingPostFeaturedStatSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const marketingPostFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string(),
  excerpt: z.string(),
  kind: marketingPostKindSchema,
  heroImageUrl: z.string(),
  featuredStats: z.array(marketingPostFeaturedStatSchema),
  contentJson: z.string(),
  published: z.boolean(),
  featured: z.boolean(),
});

export type MarketingPostFormValues = z.infer<typeof marketingPostFormSchema>;

export const marketingPostKindLabels: Record<MarketingPostKind, string> = {
  case_study: "Case study",
  blog: "Blog",
};

export function slugifyTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const featuredStatPresets = [
  { label: "Venue", value: "" },
  { label: "Turnout", value: "" },
  { label: "Production team", value: "" },
] as const;

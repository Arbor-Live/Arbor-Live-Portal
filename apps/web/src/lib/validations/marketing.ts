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
  publishedAt: z.string(),
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

export function formatPublishedAtInput(timestamp: number | null | undefined) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parsePublishedAtInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.getTime();
}

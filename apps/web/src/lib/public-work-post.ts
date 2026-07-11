import { cache } from "react";
import { api } from "@/lib/convex-api";
import { fetchPublicQuerySafe } from "@/lib/convex-server";
import type { PublicWorkPostDetail } from "@/lib/public-marketing-types";

export const getPublicWorkPostBySlug = cache(
  async (slug: string): Promise<PublicWorkPostDetail | null> => {
    return fetchPublicQuerySafe(api.publicMarketing.getPublishedPostBySlug, { slug }, null);
  },
);

export function formatPublicWorkPageTitle(postTitle: string) {
  return `${postTitle.trim()} | Arbor Live`;
}

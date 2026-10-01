import { ShortLinksManager } from "@/components/marketing/short-links-manager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Short links",
};

export default function MarketingShortLinksPage() {
  return <ShortLinksManager />;
}

import type { Metadata } from "next";
import { BrandGuidelines, BrandHeroActions } from "@/components/public/brand-guidelines";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { PublicPageHero } from "@/components/public/public-page-hero";

export const metadata: Metadata = {
  title: "Brand guidelines",
  description:
    "How to credit Arbor Live on your event, plus our logos, badges, colors and wallpaper to download.",
};

export default function BrandPage() {
  return (
    <PublicMarketingLayout>
      <PublicPageHero
        eyebrow="Brand guidelines"
        title="Working with the Arbor Live brand"
        subtitle="Everything partners and sponsored events need: how to credit us, ready-made badges, and our logos, colors and wallpaper."
        actions={<BrandHeroActions />}
      />
      <BrandGuidelines />
    </PublicMarketingLayout>
  );
}

import { MarketingDesignBoard } from "@/components/marketing/marketing-design-board";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design board",
};

export default function MarketingDesignsPage() {
  return <MarketingDesignBoard />;
}

import { MarketingDesignBoard } from "@/components/marketing/marketing-design-board";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design board",
};

export default function MarketingDesignsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Design board</h1>
        <p className="text-sm text-muted-foreground">
          Assign poster designers, upload event posters, add captions and links, then publish to Instagram and the
          public site.
        </p>
      </div>
      <MarketingDesignBoard />
    </div>
  );
}

import { MarketingSettingsManager } from "@/components/marketing/marketing-settings-manager";
import { NewsletterSubscribersManager } from "@/components/marketing/newsletter-subscribers-manager";
import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marketing settings",
};

export default function MarketingSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Marketing settings"
        description="Switches that shape the public marketing pages, and the This Week at Arbor newsletter."
      />
      <MarketingSettingsManager />
      <NewsletterSubscribersManager />
    </div>
  );
}

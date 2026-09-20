import { MarketingSettingsManager } from "@/components/marketing/marketing-settings-manager";
import { NewsletterSubscribersManager } from "@/components/marketing/newsletter-subscribers-manager";

export default function MarketingSettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Marketing settings</h1>
        <p className="text-sm text-muted-foreground">
          Feature flags that shape public-facing marketing surfaces.
        </p>
      </div>
      <MarketingSettingsManager />
      <NewsletterSubscribersManager />
    </div>
  );
}
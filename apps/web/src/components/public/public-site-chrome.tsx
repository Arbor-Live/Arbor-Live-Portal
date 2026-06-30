import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";

export function PublicSiteChrome({
  children,
  showDashboardLink,
}: {
  children: React.ReactNode;
  showDashboardLink?: boolean;
}) {
  return (
    <PublicMarketingLayout showDashboardLink={showDashboardLink}>{children}</PublicMarketingLayout>
  );
}

import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";

export function PublicSiteChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicMarketingLayout>{children}</PublicMarketingLayout>;
}

import { FloatingMarketingNav } from "@/components/public/floating-marketing-nav";
import { LandingFooter } from "@/components/landing/landing-footer";

type PublicMarketingLayoutProps = {
  children: React.ReactNode;
  hideFooter?: boolean;
  hideBanner?: boolean;
};

export function PublicMarketingLayout({
  children,
  hideFooter,
  hideBanner,
}: PublicMarketingLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-none focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {hideBanner ? null : <FloatingMarketingNav />}

      <main id="main-content" className="flex flex-1 flex-col">
        {children}
      </main>

      {hideFooter ? null : <LandingFooter />}
    </div>
  );
}

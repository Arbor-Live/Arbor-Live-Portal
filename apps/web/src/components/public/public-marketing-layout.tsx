import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { landingNavLinks } from "@/lib/landing-content";
import { LandingFooter } from "@/components/landing/landing-footer";

type PublicMarketingLayoutProps = {
  children: React.ReactNode;
  showDashboardLink?: boolean;
  hideFooter?: boolean;
};

export function PublicMarketingLayout({
  children,
  showDashboardLink,
  hideFooter,
}: PublicMarketingLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-none focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Arbor Live"
              width={140}
              height={36}
              className="h-8 w-auto brightness-0 dark:invert"
            />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {landingNavLinks.map((link) => (
              <Button key={link.label} asChild variant="ghost" size="sm">
                <Link
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener noreferrer" : undefined}
                >
                  {link.label}
                </Link>
              </Button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {showDashboardLink ? (
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : null}
            <Button asChild size="sm">
              <Link href="/public/request">Book us</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" className="flex flex-1 flex-col">
        {children}
      </main>

      {hideFooter ? null : <LandingFooter showDashboardLink={showDashboardLink} />}
    </div>
  );
}

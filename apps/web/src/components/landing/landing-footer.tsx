import Link from "next/link";
import {
  ARBOR_CONTACT_EMAIL,
  landingFooterLinks,
  landingPortalLinks,
} from "@/lib/landing-content";

type LandingFooterProps = {
  showDashboardLink?: boolean;
};

export function LandingFooter({ showDashboardLink = false }: LandingFooterProps) {
  return (
    <footer className="bg-zinc-950 text-zinc-300">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-lg font-semibold text-zinc-50">Arbor Live</p>
            <p className="mt-2 text-sm leading-relaxed">
              Stanford&apos;s student-run live event production company.
            </p>
            <a
              href={`mailto:${ARBOR_CONTACT_EMAIL}`}
              className="mt-4 inline-block text-sm text-primary-foreground hover:underline"
            >
              {ARBOR_CONTACT_EMAIL}
            </a>
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-50">Explore</p>
            <ul className="mt-3 space-y-2 text-sm">
              {landingFooterLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="hover:text-white hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-50">Portal</p>
            <ul className="mt-3 space-y-2 text-sm">
              {landingPortalLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="hover:text-white hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
              {showDashboardLink ? (
                <li>
                  <Link href="/dashboard" className="hover:text-white hover:underline">
                    Open dashboard
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <p className="mt-12 border-t border-zinc-800 pt-6 text-xs text-zinc-500">
          © {new Date().getFullYear()} Arbor Live · Office of Student Engagement, Stanford University
        </p>
      </div>
    </footer>
  );
}

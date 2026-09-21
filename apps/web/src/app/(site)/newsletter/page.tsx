import Link from "next/link";
import type { Metadata } from "next";
import { fetchPublicQuerySafe } from "@/lib/convex-server";
import { api } from "@/lib/convex-api";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { NewsletterPreferences } from "@/components/public/newsletter-preferences";

export const metadata: Metadata = {
  title: "This Week at Arbor",
  description: "Manage your Arbor Live newsletter subscription.",
};

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <PublicMarketingLayout>
        <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            This Week at Arbor
          </h1>
          <p className="mt-3 text-sm text-foreground/70">
            Use the link in a newsletter email to manage your subscription.
          </p>
          <Link
            href="/events"
            className="mt-6 inline-block text-sm font-medium text-status-emerald-800 underline-offset-4 hover:underline dark:text-primary"
          >
            See upcoming events →
          </Link>
        </div>
      </PublicMarketingLayout>
    );
  }

  const subscriber = await fetchPublicQuerySafe(api.newsletter.getByToken, { token }, null);

  return (
    <PublicMarketingLayout>
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <NewsletterPreferences token={token} initial={subscriber} />
      </div>
    </PublicMarketingLayout>
  );
}

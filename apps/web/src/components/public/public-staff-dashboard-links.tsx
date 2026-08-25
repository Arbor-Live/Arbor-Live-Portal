"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import type { Id } from "@/lib/convex-api";
import { cn } from "@/lib/utils";

type PublicStaffDashboardLinksProps = {
  invoiceId?: Id<"invoices"> | null;
  eventId?: Id<"events"> | null;
  requestId?: Id<"eventRequests"> | null;
  className?: string;
};

/**
 * Shown only when a portal user is signed in. Deep-links into dashboard
 * editors for the resources on this public quote / request / event page.
 */
export function PublicStaffDashboardLinks({
  invoiceId,
  eventId,
  requestId,
  className,
}: PublicStaffDashboardLinksProps) {
  const { data: session } = authClient.useSession();
  if (!session) return null;

  const links: { href: string; label: string }[] = [];
  if (requestId) {
    links.push({
      href: `/dashboard/events/requests/${requestId}`,
      label: "Open booking request",
    });
  }
  if (invoiceId) {
    links.push({
      href: `/dashboard/financial-hub/invoices/${invoiceId}`,
      label: "Open invoice",
    });
  }
  if (eventId) {
    links.push({
      href: `/dashboard/events/${eventId}`,
      label: "Open event",
    });
  }
  if (links.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {links.map((link) => (
        <Button key={link.href} asChild variant="outline" size="sm">
          <Link href={link.href}>{link.label}</Link>
        </Button>
      ))}
    </div>
  );
}

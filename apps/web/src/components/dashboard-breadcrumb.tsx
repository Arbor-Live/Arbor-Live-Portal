"use client";

import { usePathname } from "next/navigation";
import { useSessionShell } from "@/components/session-shell-provider";
import { isArtistOrganizationType } from "@/lib/artist-types";
import { sectionLabelForPath } from "@/lib/nav";

/** Where you are in the dashboard: "Events / Venues", from the sidebar's labels. */
export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const shell = useSessionShell();
  const isBandContext = isArtistOrganizationType(shell?.activeOrganization?.organizationType);
  return <p className="font-medium">{sectionLabelForPath(pathname, { isBandContext })}</p>;
}

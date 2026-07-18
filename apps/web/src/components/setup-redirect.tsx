"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";

/**
 * When no admin exists yet, send every route except /setup to first-admin setup.
 */
export function SetupRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const availability = useQuery(api.bootstrap.isSetupAvailable, {});

  useEffect(() => {
    if (availability === undefined) return;
    if (!availability.available) return;
    if (pathname === "/setup" || pathname.startsWith("/setup/")) return;
    router.replace("/setup");
  }, [availability, pathname, router]);

  return null;
}

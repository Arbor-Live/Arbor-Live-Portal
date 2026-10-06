"use client";

import { CameraWorkspace } from "@/components/camera/camera-workspace";
import { EmptyState } from "@/components/list-page";
import { useSessionShell } from "@/components/session-shell-provider";
import { Skeleton } from "@/components/ui/skeleton";

/** Camera footage is for Arbor Live admins only. */
export function CameraPageClient() {
  const shell = useSessionShell();
  const viewer = shell?.viewer;
  const activeOrganization = shell === undefined ? undefined : (shell?.activeOrganization ?? null);
  if (!viewer || activeOrganization === undefined) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!viewer.isAdmin || activeOrganization?.organizationType !== "arbor_internal") {
    return <EmptyState>The camera is only available to Arbor Live admins.</EmptyState>;
  }

  return <CameraWorkspace />;
}

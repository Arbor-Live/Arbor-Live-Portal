"use client";

import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";
import { EmptyState } from "@/components/list-page";
import { Skeleton } from "@/components/ui/skeleton";
import { isArtistOrganizationType } from "@/lib/artist-types";

/**
 * Blocks non-admin members of Arbor Live.
 *
 * `ArborOnlyGuard` only checks organization *type*, so a crew member — who is a
 * genuine `arbor_internal` member — walks straight through it and then trips
 * `requireAdmin` in Convex, landing on the generic "Something went wrong" error
 * boundary. That fails closed but reads as a crash.
 *
 * This is defence-in-depth for legibility only: the Convex guards remain the
 * real boundary, since anything rendered client-side can be bypassed.
 */
export function AdminOnlyGuard({ children }: { children: React.ReactNode }) {
  const shell = useSessionShell();
  const viewer = useSessionViewer();

  // Shell still loading — hold the page shell rather than flashing a denial.
  if (shell === undefined) return <Skeleton className="h-48 w-full" />;
  if (!viewer?.isAdmin) {
    return (
      <EmptyState>
        Admin access required. This section is limited to Arbor Live admins. Ask an admin if you
        need access.
      </EmptyState>
    );
  }

  return <>{children}</>;
}

/** Renders its children for admins only, nothing for anyone else (an admin-only button on a shared page). */
export function AdminOnlyContent({ children }: { children: React.ReactNode }) {
  const viewer = useSessionViewer();
  return viewer?.isAdmin ? <>{children}</> : null;
}

/**
 * Blocks Arbor staff outside the Operations team (crew), the way
 * `AdminOnlyGuard` blocks non-admins. Admins always pass. Convex enforces the
 * same rule; this keeps the refusal legible instead of an error boundary.
 */
export function OperationsOrAdminGuard({ children }: { children: React.ReactNode }) {
  const shell = useSessionShell();
  const viewer = useSessionViewer();

  if (shell === undefined) return <Skeleton className="h-48 w-full" />;
  if (!viewer?.isAdmin && !viewer?.verticals.includes("Operations")) {
    return (
      <EmptyState>
        Operations access required. This section is limited to the Operations team and Arbor Live
        admins. Ask an admin if you need access.
      </EmptyState>
    );
  }

  return <>{children}</>;
}

export function ArborOnlyGuard({ children }: { children: React.ReactNode }) {
  const shell = useSessionShell();
  const activeOrg = shell === undefined ? undefined : (shell?.activeOrganization ?? null);

  if (activeOrg === undefined) return <Skeleton className="h-48 w-full" />;
  if (!activeOrg) {
    return (
      <EmptyState>
        No Active Organization. Select an active organization from the sidebar to continue.
      </EmptyState>
    );
  }
  if (activeOrg.organizationType !== "arbor_internal") {
    return (
      <EmptyState>
        Arbor Internal Only. This section is only available while your active organization is Arbor
        Live.
      </EmptyState>
    );
  }

  return <>{children}</>;
}

export function BandOnlyGuard({ children }: { children: React.ReactNode }) {
  const shell = useSessionShell();
  const activeOrg = shell === undefined ? undefined : (shell?.activeOrganization ?? null);
  if (activeOrg === undefined) return <Skeleton className="h-48 w-full" />;
  if (!activeOrg) {
    return (
      <EmptyState>
        No Active Organization. Select an active organization from the sidebar to continue.
      </EmptyState>
    );
  }
  if (!isArtistOrganizationType(activeOrg.organizationType)) {
    return (
      <EmptyState>
        Artist Organization Only. Switch to an artist organization in the sidebar to access this
        section.
      </EmptyState>
    );
  }
  return <>{children}</>;
}

/**
 * Band self-service plus portal admins managing any band without membership.
 */
export function BandOrAdminGuard({ children }: { children: React.ReactNode }) {
  const shell = useSessionShell();
  const viewer = useSessionViewer();
  const activeOrg = shell === undefined ? undefined : (shell?.activeOrganization ?? null);

  if (shell === undefined) return <Skeleton className="h-48 w-full" />;
  if (viewer?.isAdmin) return <>{children}</>;

  if (activeOrg === undefined) return <Skeleton className="h-48 w-full" />;
  if (!activeOrg) {
    return (
      <EmptyState>
        No Active Organization. Select an active organization from the sidebar to continue.
      </EmptyState>
    );
  }
  if (isArtistOrganizationType(activeOrg.organizationType)) {
    return <>{children}</>;
  }

  return (
    <EmptyState>
      Admin access required. This section is limited to artist organizations and Arbor Live admins.
    </EmptyState>
  );
}

"use client";

import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  // Shell still loading — render nothing rather than flashing a denial.
  if (shell === undefined) return null;
  if (!viewer?.isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admin access required</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This section is limited to Arbor Live admins. Ask an admin if you need access.
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}

export function ArborOnlyGuard({ children }: { children: React.ReactNode }) {
  const shell = useSessionShell();
  const activeOrg = shell === undefined ? undefined : (shell?.activeOrganization ?? null);

  if (activeOrg === undefined) return null;
  if (!activeOrg) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Active Organization</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Select an active organization from the sidebar to continue.
        </CardContent>
      </Card>
    );
  }
  if (activeOrg.organizationType !== "arbor_internal") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Arbor Internal Only</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This section is only available while your active organization is Arbor Live.
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}

export function BandOnlyGuard({ children }: { children: React.ReactNode }) {
  const shell = useSessionShell();
  const activeOrg = shell === undefined ? undefined : (shell?.activeOrganization ?? null);
  if (activeOrg === undefined) return null;
  if (!activeOrg) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Active Organization</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Select an active organization from the sidebar to continue.
        </CardContent>
      </Card>
    );
  }
  if (activeOrg.organizationType !== "band" && activeOrg.organizationType !== "dj") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Band Organization Only</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Switch to a band organization in the sidebar to access this section.
        </CardContent>
      </Card>
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

  if (shell === undefined) return null;
  if (viewer?.isAdmin) return <>{children}</>;

  if (activeOrg === undefined) return null;
  if (!activeOrg) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Active Organization</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Select an active organization from the sidebar to continue.
        </CardContent>
      </Card>
    );
  }
  if (activeOrg.organizationType === "band" || activeOrg.organizationType === "dj") {
    return <>{children}</>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin access required</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        This section is limited to band organizations and Arbor Live admins.
      </CardContent>
    </Card>
  );
}

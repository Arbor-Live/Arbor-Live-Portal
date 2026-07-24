"use client";

import { useSessionShell } from "@/components/session-shell-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  if (activeOrg.organizationType !== "band") {
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

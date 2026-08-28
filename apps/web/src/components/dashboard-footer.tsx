"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSessionShell } from "@/components/session-shell-provider";

export function DashboardFooter() {
  const shell = useSessionShell();
  const account = shell?.account;
  const activeOrganization = shell?.activeOrganization;

  const userName = account?.name ?? "Unknown user";
  const userEmail = account?.email ?? "No email";
  const org = activeOrganization?.name ?? "Arbor Live";

  return (
    <div className="border-t p-4">
      <div className="mb-4 space-y-1">
        <p className="font-medium">{userName}</p>
        <p className="text-muted-foreground">{userEmail}</p>
        <p className="text-muted-foreground">Org: {org}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <ThemeToggle />
        <Button asChild variant="outline">
          <Link href="/dashboard/account">Account settings</Link>
        </Button>
        <Button
          variant="destructive"
          onClick={async () => {
            await authClient.signOut();
            window.location.href = "/sign-in";
          }}
        >
          Log out
        </Button>
      </div>
    </div>
  );
}

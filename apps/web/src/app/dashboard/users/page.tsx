import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function UsersPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            User management is now split into focused sections.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Access & Invites</CardTitle>
              <CardDescription>Manage users, memberships, and invitation flows.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/dashboard/users/access">Open Access Management</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Organizations</CardTitle>
              <CardDescription>Create orgs, set active org defaults, and edit band org profiles.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/dashboard/users/organizations">Open Organization Management</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Crew Rates</CardTitle>
              <CardDescription>Manage invoice global crew rates and per-user compensation rates.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/dashboard/users/crew-rates">Open Crew Rates</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </ArborOnlyGuard>
    </div>
  );
}

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";

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
        <AdminOnlyGuard>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                <CardTitle>Band applications</CardTitle>
                <CardDescription>
                  Review public artist applications from the Artists page.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/dashboard/users/band-applications">Open Band Applications</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Crew applications</CardTitle>
                <CardDescription>
                  Review public crew join requests, assign trainees, and convert to members.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/dashboard/users/crew-applications">Open Crew Applications</Link>
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
            <Card>
              <CardHeader>
                <CardTitle>Crew Timecards</CardTitle>
                <CardDescription>Review crew hours by pay period and drill into day-by-day details.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/dashboard/timecards">Open Crew Timecards</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </AdminOnlyGuard>
      </ArborOnlyGuard>
    </div>
  );
}

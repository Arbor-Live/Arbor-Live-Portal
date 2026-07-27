import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { UsersManagementClient } from "@/components/users/users-management-client";

export default function UsersAccessPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>User Access & Invitations</CardTitle>
          <CardDescription>
            Manage user records, memberships, and invitation workflows.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <AdminOnlyGuard>
          <UsersManagementClient view="access" />
        </AdminOnlyGuard>
      </ArborOnlyGuard>
    </div>
  );
}

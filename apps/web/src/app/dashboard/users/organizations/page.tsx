import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { UsersManagementClient } from "@/components/users/users-management-client";

export default function UsersOrganizationsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Organization Management</CardTitle>
          <CardDescription>
            Manage organizations and edit band org profile details from an admin birds-eye view.
          </CardDescription>
        </CardHeader>
      </Card>
      <ArborOnlyGuard>
        <UsersManagementClient view="organizations" />
      </ArborOnlyGuard>
    </div>
  );
}

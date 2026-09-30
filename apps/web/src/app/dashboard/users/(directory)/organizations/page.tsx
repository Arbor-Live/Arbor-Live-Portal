import { Suspense } from "react";
import { OrganizationsTab } from "@/components/users/directory/organizations-tab";

export default function UsersOrganizationsPage() {
  return (
    <Suspense>
      <OrganizationsTab />
    </Suspense>
  );
}

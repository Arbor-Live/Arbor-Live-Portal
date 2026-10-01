import { Suspense } from "react";
import { OrganizationsTab } from "@/components/users/directory/organizations-tab";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Organizations",
};

export default function UsersOrganizationsPage() {
  return (
    <Suspense>
      <OrganizationsTab />
    </Suspense>
  );
}

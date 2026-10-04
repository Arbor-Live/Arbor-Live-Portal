import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { UserRatesAdminClient } from "@/components/users/user-rates-admin-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crew rates",
};

export default function CrewRatesPage() {
  return (
    <ArborOnlyGuard>
      <AdminOnlyGuard>
        <UserRatesAdminClient />
      </AdminOnlyGuard>
    </ArborOnlyGuard>
  );
}

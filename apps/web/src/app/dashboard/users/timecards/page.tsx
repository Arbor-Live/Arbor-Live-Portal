import { ArborOnlyGuard } from "@/components/org-context-guard";
import { AdminTimecardsOverviewClient } from "@/components/timecards/admin-timecards-overview-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crew timecards",
};

export default function AdminTimecardsPage() {
  return (
    <ArborOnlyGuard>
      <AdminTimecardsOverviewClient />
    </ArborOnlyGuard>
  );
}

import { ScheduleTab } from "@/components/hashing/schedule-tab";
import { OperationsOrAdminGuard } from "@/components/org-context-guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hashing schedule",
};

export default function HashingSchedulePage() {
  return (
    <OperationsOrAdminGuard>
      <ScheduleTab />
    </OperationsOrAdminGuard>
  );
}

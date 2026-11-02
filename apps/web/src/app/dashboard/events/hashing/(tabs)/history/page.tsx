import { HistoryTab } from "@/components/hashing/history-tab";
import { OperationsOrAdminGuard } from "@/components/org-context-guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hashing history",
};

export default function HashingHistoryPage() {
  return (
    <OperationsOrAdminGuard>
      <HistoryTab />
    </OperationsOrAdminGuard>
  );
}

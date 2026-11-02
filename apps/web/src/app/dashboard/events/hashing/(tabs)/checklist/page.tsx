import { ChecklistTab } from "@/components/hashing/checklist-tab";
import { OperationsOrAdminGuard } from "@/components/org-context-guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hashing checklist",
};

export default function HashingChecklistPage() {
  return (
    <OperationsOrAdminGuard>
      <ChecklistTab />
    </OperationsOrAdminGuard>
  );
}

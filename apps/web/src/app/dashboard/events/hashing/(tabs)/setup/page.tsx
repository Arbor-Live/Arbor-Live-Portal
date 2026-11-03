import { SetupTab } from "@/components/hashing/setup-tab";
import { OperationsOrAdminGuard } from "@/components/org-context-guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hashing setup",
};

export default function HashingSetupPage() {
  return (
    <OperationsOrAdminGuard>
      <SetupTab />
    </OperationsOrAdminGuard>
  );
}

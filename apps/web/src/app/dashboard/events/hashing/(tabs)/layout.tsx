import { HashingShell } from "@/components/hashing/hashing-shell";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function HashingTabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ArborOnlyGuard>
      <HashingShell>{children}</HashingShell>
    </ArborOnlyGuard>
  );
}

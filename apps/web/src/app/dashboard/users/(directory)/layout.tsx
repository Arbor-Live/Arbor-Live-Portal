import { AdminOnlyGuard, ArborOnlyGuard } from "@/components/org-context-guard";
import { UsersDirectoryShell } from "@/components/users/directory/users-directory-shell";

/** People · Invitations · Organizations share one header, tabs, and org filter. */
export default function UsersDirectoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <ArborOnlyGuard>
      <AdminOnlyGuard>
        <UsersDirectoryShell>{children}</UsersDirectoryShell>
      </AdminOnlyGuard>
    </ArborOnlyGuard>
  );
}

import { Suspense } from "react";
import { InvitationsTab } from "@/components/users/directory/invitations-tab";

export default function UsersInvitationsPage() {
  return (
    <Suspense>
      <InvitationsTab />
    </Suspense>
  );
}

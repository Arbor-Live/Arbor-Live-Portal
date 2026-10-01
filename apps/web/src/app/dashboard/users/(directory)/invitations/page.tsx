import { Suspense } from "react";
import { InvitationsTab } from "@/components/users/directory/invitations-tab";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invitations",
};

export default function UsersInvitationsPage() {
  return (
    <Suspense>
      <InvitationsTab />
    </Suspense>
  );
}

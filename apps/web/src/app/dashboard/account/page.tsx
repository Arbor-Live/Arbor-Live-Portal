import { AccountSettingsClient } from "@/components/account/account-settings-client";
import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account settings",
};

export default function AccountSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Account settings"
        description="Manage your profile, email, password, and passkeys for Arbor Live Portal."
      />
      <AccountSettingsClient />
    </div>
  );
}

import { AccountSettingsClient } from "@/components/account/account-settings-client";
import { PageHeader } from "@/components/page-header";

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

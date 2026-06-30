import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AccountSettingsClient } from "@/components/account/account-settings-client";

export default function AccountSettingsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Account settings</CardTitle>
          <CardDescription>
            Manage your profile, email, password, and passkeys for Arbor Live Portal.
          </CardDescription>
        </CardHeader>
      </Card>
      <AccountSettingsClient />
    </div>
  );
}

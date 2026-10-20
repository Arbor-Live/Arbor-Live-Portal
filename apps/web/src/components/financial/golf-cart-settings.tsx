"use client";

import { getConvexErrorMessage } from "@/lib/convex-error";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertRecipientList } from "@/components/financial/alert-recipient-list";
import { notify } from "@/lib/notify";

export function GolfCartSettings() {
  const settings = useQuery(api.golfCart.getGolfCartSettings, {});
  const save = useMutation(api.golfCart.updateGolfCartSettings);

  const [localRecipients, setLocalRecipients] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const ready = settings !== undefined;
  const recipients = localRecipients ?? settings?.alertRecipients ?? [];

  async function handleSave() {
    setSaving(true);
    try {
      await save({ alertRecipients: recipients });
      setLocalRecipients(null);
      notify.success("Golf cart settings saved.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Failed to save settings."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Golf cart</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AlertRecipientList
          label="Notify when a cart event is Ready"
          recipients={recipients}
          onChange={setLocalRecipients}
          disabled={!ready || saving}
        />
        <Button
          type="button"
          size="sm"
          disabled={!ready || saving}
          onClick={() => void handleSave()}
        >
          Save golf cart settings
        </Button>
      </CardContent>
    </Card>
  );
}

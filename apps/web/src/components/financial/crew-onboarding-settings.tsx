"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertRecipientList } from "@/components/financial/alert-recipient-list";
import { notify } from "@/lib/notify";

export function CrewOnboardingSettings() {
  const settings = useQuery(api.onboarding.getCrewOnboardingSettings, {});
  const save = useMutation(api.onboarding.updateCrewOnboardingSettings);

  const [localAlert, setLocalAlert] = useState<string[] | null>(null);
  const [localPayroll, setLocalPayroll] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const ready = settings !== undefined;
  const alertRecipients = localAlert ?? settings?.alertRecipients ?? [];
  const stanfordPayrollRecipients = localPayroll ?? settings?.stanfordPayrollRecipients ?? [];

  async function handleSave() {
    setSaving(true);
    try {
      await save({ alertRecipients, stanfordPayrollRecipients });
      setLocalAlert(null);
      setLocalPayroll(null);
      notify.success("Crew onboarding settings saved.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crew onboarding</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AlertRecipientList
          label="Notify on completion"
          recipients={alertRecipients}
          reservedEmails={settings?.adminRecipients}
          onChange={setLocalAlert}
          disabled={!ready || saving}
        />
        <AlertRecipientList
          label="Stanford payroll (HR / FWS)"
          recipients={stanfordPayrollRecipients}
          reservedEmails={settings?.adminRecipients}
          onChange={setLocalPayroll}
          disabled={!ready || saving}
        />
        <Button
          type="button"
          size="sm"
          disabled={!ready || saving}
          onClick={() => void handleSave()}
        >
          Save onboarding settings
        </Button>
      </CardContent>
    </Card>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function UserRatesAdminClient() {
  const users = useQuery(api.users.listWithRates, {});
  const invoiceSettings = useQuery(api.invoiceSettings.get, {});
  const setHourlyRate = useMutation(api.users.setHourlyRate);
  const updateInvoiceSettings = useMutation(api.invoiceSettings.update);
  const [draftRates, setDraftRates] = useState<Record<string, string>>({});
  const [normalCrewRateUsd, setNormalCrewRateUsd] = useState("");
  const [leadCrewRateUsd, setLeadCrewRateUsd] = useState("");
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savingGlobalRates, setSavingGlobalRates] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rows = useMemo(() => users ?? [], [users]);

  async function saveRate(userId: string, fallbackRate: number | null) {
    const value = draftRates[userId];
    const nextRate = Number(value ?? fallbackRate ?? 0);
    if (Number.isNaN(nextRate) || nextRate < 0) {
      setMessage("Hourly rate must be a positive number.");
      return;
    }
    setSavingUserId(userId);
    setMessage(null);
    try {
      await setHourlyRate({ userId, hourlyRateUsd: nextRate });
      setMessage("User rate updated.");
    } finally {
      setSavingUserId(null);
    }
  }

  async function saveGlobalCrewRates() {
    const normal = Number((normalCrewRateUsd || invoiceSettings?.crewNormalRateUsd) ?? 0);
    const lead = Number(
      (leadCrewRateUsd || invoiceSettings?.crewLeadRateUsd || invoiceSettings?.crewOtRateUsd) ?? normal,
    );
    if (Number.isNaN(normal) || Number.isNaN(lead) || normal < 0 || lead < 0) {
      setMessage("Global crew rates must be valid positive numbers.");
      return;
    }
    setSavingGlobalRates(true);
    setMessage(null);
    try {
      await updateInvoiceSettings({
        crewNormalRateUsd: normal,
        crewLeadRateUsd: lead,
        // Keep legacy OT field aligned with lead until OT mode is fully retired.
        crewOtRateUsd: lead,
      });
      setMessage("Global invoice crew rates updated.");
    } finally {
      setSavingGlobalRates(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Invoice Crew Rate Modes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Invoices support three crew pricing modes: Normal, Lead, and Custom (per row).
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Normal Rate (USD)</p>
              <Input
                inputMode="decimal"
                value={normalCrewRateUsd || (invoiceSettings?.crewNormalRateUsd ?? 0).toString()}
                onChange={(e) => setNormalCrewRateUsd(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Lead Rate (USD)</p>
              <Input
                inputMode="decimal"
                value={
                  leadCrewRateUsd ||
                  (invoiceSettings?.crewLeadRateUsd ?? invoiceSettings?.crewOtRateUsd ?? 0).toString()
                }
                onChange={(e) => setLeadCrewRateUsd(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" disabled={savingGlobalRates} onClick={() => void saveGlobalCrewRates()}>
                Save Global Crew Rates
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Compensation Rates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Admin only: set each user hourly rate used for event crew cost calculations.
          </p>
          {message ? <p className="text-sm text-primary">{message}</p> : null}
          <div className="space-y-2">
            {rows.map((user) => (
              <div key={user.id} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_220px_120px]">
                <div>
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[user.role, user.email].filter(Boolean).join(" • ")}
                  </p>
                </div>
                <Input
                  value={draftRates[user.id] ?? (user.hourlyRateUsd ?? 0).toString()}
                  onChange={(e) =>
                    setDraftRates((prev) => ({
                      ...prev,
                      [user.id]: e.target.value,
                    }))
                  }
                  inputMode="decimal"
                  placeholder="Hourly rate (USD)"
                />
                <Button
                  type="button"
                  disabled={savingUserId === user.id}
                  onClick={() => void saveRate(user.id, user.hourlyRateUsd)}
                >
                  Save
                </Button>
              </div>
            ))}
            {users === undefined ? <p className="text-sm text-muted-foreground">Loading users...</p> : null}
            {users?.length === 0 ? <p className="text-sm text-muted-foreground">No users found.</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

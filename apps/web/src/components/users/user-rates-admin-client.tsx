"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function UserRatesAdminClient() {
  const users = useQuery(api.users.listWithRates, {});
  const setHourlyRate = useMutation(api.users.setHourlyRate);
  const [draftRates, setDraftRates] = useState<Record<string, string>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
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

  return (
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
  );
}

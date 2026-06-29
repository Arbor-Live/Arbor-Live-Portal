"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function FinancialHubManagersClient() {
  const managers = useQuery(api.invoices.listInvoiceManagersForAdmin, {});
  const updateUserAdmin = useMutation(api.users.updateUserAdmin);
  const [message, setMessage] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { title: string; phone: string }>>({});

  const rows = useMemo(() => managers ?? [], [managers]);

  function draftFor(userId: string, title: string, phone: string) {
    return drafts[userId] ?? { title, phone };
  }

  async function saveManager(userId: string, fallbackTitle: string, fallbackPhone: string) {
    const draft = draftFor(userId, fallbackTitle, fallbackPhone);
    setSavingUserId(userId);
    setMessage(null);
    try {
      await updateUserAdmin({
        userId,
        title: draft.title.trim() || undefined,
        phone: draft.phone.trim() || undefined,
      });
      setMessage("Manager profile updated.");
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice managers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Users who can be assigned as the invoice manager. Title and phone appear on quotes and client communications.
        </p>
        {message ? <p className="text-sm text-primary">{message}</p> : null}
        <div className="space-y-2">
          {rows.map((manager) => {
            const draft = draftFor(manager.id, manager.title, manager.phone);
            return (
              <div
                key={manager.id}
                className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_180px_160px_120px_100px]"
              >
                <div>
                  <p className="text-sm font-medium">{manager.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[manager.role, manager.email].filter(Boolean).join(" • ")}
                  </p>
                </div>
                <Input
                  placeholder="Title"
                  value={draft.title}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [manager.id]: { ...draft, title: e.target.value },
                    }))
                  }
                />
                <Input
                  placeholder="Phone"
                  value={draft.phone}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [manager.id]: { ...draft, phone: e.target.value },
                    }))
                  }
                />
                <span className="self-center text-xs text-muted-foreground">
                  {manager.active ? "Active" : "Inactive"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={savingUserId === manager.id}
                  onClick={() => void saveManager(manager.id, manager.title, manager.phone)}
                >
                  Save
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

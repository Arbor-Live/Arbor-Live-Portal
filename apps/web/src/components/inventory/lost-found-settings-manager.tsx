"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormState = {
  instructions: string;
  contactEmail: string;
  infoUrl: string;
};

function LostFoundForm({ initial }: { initial: FormState }) {
  const updateSettings = useMutation(api.lostFoundSettings.update);
  const [form, setForm] = useState(initial);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public Lost &amp; Found copy</CardTitle>
        <p className="text-sm text-muted-foreground">
          This text appears on every public equipment page at{" "}
          <span className="font-mono">/e/[asset ID]</span> for registered assets. Return instructions and contact info
          are shared globally — not per item.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Return instructions</Label>
          <textarea
            className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={form.instructions}
            onChange={(event) => setForm((prev) => ({ ...prev, instructions: event.target.value }))}
            placeholder="Where to bring found equipment, hours, desk location, etc."
          />
        </div>
        <div className="space-y-2">
          <Label>Contact email (optional)</Label>
          <Input
            value={form.contactEmail}
            onChange={(event) => setForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
            placeholder="equipment@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label>More info URL (optional)</Label>
          <Input
            value={form.infoUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, infoUrl: event.target.value }))}
            placeholder="https://..."
          />
        </div>
        <Button
          type="button"
          onClick={() =>
            void updateSettings({
              instructions: form.instructions.trim() || undefined,
              contactEmail: form.contactEmail.trim() || undefined,
              infoUrl: form.infoUrl.trim() || undefined,
            })
          }
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

export function LostFoundSettingsManager() {
  const settings = useQuery(api.lostFoundSettings.get, {});

  if (settings === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const initial: FormState = {
    instructions: settings?.instructions ?? "",
    contactEmail: settings?.contactEmail ?? "",
    infoUrl: settings?.infoUrl ?? "",
  };

  const versionKey = settings ? `${settings._id}-${settings.updatedAt}` : "none";

  return <LostFoundForm key={versionKey} initial={initial} />;
}

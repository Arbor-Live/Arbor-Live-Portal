"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function MarketingSettingsForm({
  initial,
  versionKey,
}: {
  initial: boolean;
  versionKey: string;
}) {
  const updateSettings = useMutation(api.marketingSettings.update);
  // Local mirror so the toggle feels instant; the server is source of truth.
  void versionKey;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Open Mic marketing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Toggles that shape the public Open Mic sign-up form. When on, the form shows a first slide
          explaining what Arbor Live is, with the promo video playing in the background and a link to
          our socials. More sections may be added here in the future.
        </p>
        <label className="flex w-full cursor-pointer items-center gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={initial}
            onChange={(event) => {
              void updateSettings({ openMicMarketingBoost: event.target.checked });
            }}
          />
          <span>
            <span className="font-medium">Increased marketing in Open Mic</span>
            <span className="block text-xs text-muted-foreground">
              Adds the Arbor Live intro slide as the first step of the public open mic form.
            </span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}

export function MarketingSettingsManager() {
  const settings = useQuery(api.marketingSettings.get, {});
  if (settings === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  const initial = settings?.openMicMarketingBoost ?? false;
  const versionKey = settings ? `${settings.updatedAt}` : "none";
  return <MarketingSettingsForm initial={initial} versionKey={versionKey} />;
}
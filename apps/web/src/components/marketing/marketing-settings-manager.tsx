"use client";

import { useMutation, useQuery } from "convex/react";
import { MegaphoneIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";

export function MarketingSettingsManager() {
  const settings = useQuery(api.marketingSettings.get, {});
  const updateSettings = useMutation(api.marketingSettings.update);

  async function setBoost(enabled: boolean) {
    try {
      await updateSettings({ openMicMarketingBoost: enabled });
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MegaphoneIcon className="size-4 text-muted-foreground" aria-hidden />
          Open Mic marketing
        </CardTitle>
        <p className="text-sm text-muted-foreground">Shapes the public Open Mic sign-up form.</p>
      </CardHeader>
      <CardContent>
        {settings === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex items-start justify-between gap-4 border p-3 text-sm">
            <Label htmlFor="open-mic-marketing-boost" className="block space-y-0.5 font-normal">
              <span className="block font-medium">Increased marketing in Open Mic</span>
              <span className="block text-xs text-muted-foreground">
                Adds an intro slide as the first step of the form: what Arbor Live is, with the promo video
                playing behind it and a link to our socials.
              </span>
            </Label>
            <Switch
              id="open-mic-marketing-boost"
              checked={settings?.openMicMarketingBoost ?? false}
              onCheckedChange={(checked) => void setBoost(checked)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

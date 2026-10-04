"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BellIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/convex-api";

type Channel = "email" | "inApp" | "push";

const CHANNELS: { key: Channel; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "inApp", label: "In-app" },
  { key: "push", label: "Push" },
];

type Preference = {
  template: string;
  label: string;
  group: string;
  email: boolean;
  inApp: boolean | null;
  push: boolean | null;
};

const overrideKey = (template: string, channel: Channel) => `${template}:${channel}`;

/** Per notification type, which channels reach you: email, the bell, push. */
export function NotificationPreferences() {
  const preferences = useQuery(api.account.getMyNotificationPreferences, {});
  const update = useMutation(api.account.updateMyNotificationPreference);
  // Optimistic per-switch overrides until the reactive query catches up.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (preferences !== undefined && preferences.length === 0) return null;

  const value = (entry: Preference, channel: Channel) => {
    const server = entry[channel];
    if (server === null) return null;
    return overrides[overrideKey(entry.template, channel)] ?? server;
  };

  async function toggle(template: string, channel: Channel, enabled: boolean) {
    const key = overrideKey(template, channel);
    setOverrides((previous) => ({ ...previous, [key]: enabled }));
    setBusy(key);
    setError(null);
    try {
      await update({ template, channel, enabled });
    } catch (toggleError) {
      setOverrides((previous) => ({ ...previous, [key]: !enabled }));
      setError(
        toggleError instanceof Error ? toggleError.message : "Unable to save your notification settings.",
      );
    } finally {
      setBusy(null);
    }
  }

  const groups = new Map<string, Preference[]>();
  for (const entry of preferences ?? []) {
    const list = groups.get(entry.group) ?? [];
    list.push(entry);
    groups.set(entry.group, list);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon className="size-5" />
          Notifications
        </CardTitle>
        <CardDescription>
          Choose where each notification reaches you. Push also needs to be on for the device above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {preferences === undefined ? (
          <p className="text-sm text-muted-foreground">Loading notification settings…</p>
        ) : (
          [...groups.entries()].map(([group, entries], groupIndex) => (
            <div key={group} className="space-y-3">
              <div className="flex items-end justify-between gap-4">
                <p className="text-xs font-medium text-muted-foreground">{group}</p>
                {groupIndex === 0 ? (
                  <div className="flex shrink-0 gap-2" aria-hidden>
                    {CHANNELS.map((channel) => (
                      <span key={channel.key} className="w-12 text-center text-2xs text-muted-foreground">
                        {channel.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {entries.map((entry) => (
                <div key={entry.template} className="flex items-center justify-between gap-4">
                  <span className="text-sm">{entry.label}</span>
                  <div className="flex shrink-0 gap-2">
                    {CHANNELS.map((channel) => {
                      const checked = value(entry, channel.key);
                      const pushBlocked = channel.key === "push" && value(entry, "inApp") === false;
                      return (
                        <span key={channel.key} className="flex w-12 justify-center">
                          {checked === null ? (
                            <span className="text-xs text-muted-foreground" aria-hidden>
                              —
                            </span>
                          ) : (
                            <Switch
                              aria-label={`${entry.label}: ${channel.label}`}
                              checked={checked && !pushBlocked}
                              disabled={
                                pushBlocked || busy === overrideKey(entry.template, channel.key)
                              }
                              onCheckedChange={(next) => void toggle(entry.template, channel.key, next)}
                            />
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BellIcon,
  DeviceMobileIcon,
  EnvelopeSimpleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/convex-api";
import { cn } from "@/lib/utils";

type Channel = "email" | "inApp" | "push";

const CHANNELS: { key: Channel; label: string; icon: Icon }[] = [
  { key: "email", label: "Email", icon: EnvelopeSimpleIcon },
  { key: "inApp", label: "In the bell", icon: BellIcon },
  { key: "push", label: "Push", icon: DeviceMobileIcon },
];

type Preference = {
  template: string;
  label: string;
  group: string;
  email: boolean;
  emailLocked: boolean;
  inApp: boolean | null;
  push: boolean | null;
};

/** A channel the user can't change here, shown fixed on or off with the reason. */
type ChannelLock = { on: boolean; reason: string };

function channelLock(entry: Preference, channel: Channel, inAppOn: boolean | null): ChannelLock | null {
  if (channel === "email" && entry.emailLocked) {
    return { on: true, reason: "Always on: this email carries the calendar invite" };
  }
  // Push needs the bell row; it locks off with it.
  if (channel === "push" && inAppOn === false) {
    return { on: false, reason: "Push needs “In the bell” on" };
  }
  return null;
}

const overrideKey = (template: string, channel: Channel) => `${template}:${channel}`;

/** Per notification type, which channels reach you: email, the bell, push. */
export function NotificationPreferences() {
  const preferences = useQuery(api.account.getMyNotificationPreferences, {});
  const update = useMutation(api.account.updateMyNotificationPreference);
  // Optimistic value per chip while its save is in flight.
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
      setError(
        toggleError instanceof Error ? toggleError.message : "Unable to save your notification settings.",
      );
    } finally {
      // Convex applies the mutation's query updates before it resolves, so the
      // server value takes over without a flicker (and on failure, reverts).
      setOverrides(({ [key]: _settled, ...rest }) => rest);
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
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-2xs text-muted-foreground">
          {CHANNELS.map(({ key, label, icon: ChannelIcon }) => (
            <span key={key} className="inline-flex items-center gap-1">
              <ChannelIcon weight="fill" className="size-3.5 text-primary" />
              {label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {preferences === undefined ? (
          <p className="text-sm text-muted-foreground">Loading notification settings…</p>
        ) : (
          <TooltipProvider delayDuration={300}>
            {[...groups.entries()].map(([group, entries]) => (
              <div key={group} className="space-y-1">
                <p className="pb-1 text-xs font-medium text-muted-foreground">{group}</p>
                {entries.map((entry) => (
                  <div key={entry.template} className="flex items-center justify-between gap-4 py-0.5">
                    <span className="text-sm">{entry.label}</span>
                    <div className="flex shrink-0 gap-1">
                      {CHANNELS.map((channel) => (
                        <ChannelChip
                          key={channel.key}
                          channel={channel}
                          rowLabel={entry.label}
                          on={value(entry, channel.key)}
                          lock={channelLock(entry, channel.key, value(entry, "inApp"))}
                          busy={busy === overrideKey(entry.template, channel.key)}
                          onChange={(next) => void toggle(entry.template, channel.key, next)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </TooltipProvider>
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

/** One channel's on/off as an icon button: filled when on, outline when off. */
function ChannelChip({
  channel,
  rowLabel,
  on,
  lock,
  busy,
  onChange,
}: {
  channel: (typeof CHANNELS)[number];
  rowLabel: string;
  on: boolean | null;
  lock: ChannelLock | null;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  const ChannelIcon = channel.icon;
  // Email-only types: keep the column aligned without a control.
  if (on === null) return <span className="size-8" aria-hidden />;
  const pressed = lock ? lock.on : on;
  const hint = lock ? lock.reason : `${channel.label}: ${pressed ? "on" : "off"}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Span keeps the tooltip working while the toggle is disabled. */}
        <span>
          <Toggle
            size="sm"
            aria-label={`${rowLabel}: ${channel.label}`}
            pressed={pressed}
            disabled={lock !== null || busy}
            onPressedChange={onChange}
            className={cn(
              "size-8 min-w-8 rounded-full border px-0",
              pressed
                ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary data-[state=on]:bg-primary/10"
                : "border-border text-muted-foreground/70",
              // A fixed-on channel still reads as on, just not clickable.
              lock?.on && "disabled:opacity-60",
            )}
          >
            <ChannelIcon weight={pressed ? "fill" : "regular"} className="size-4" />
          </Toggle>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{hint}</TooltipContent>
    </Tooltip>
  );
}

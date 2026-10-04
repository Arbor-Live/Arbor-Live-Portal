"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { DeviceMobileIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/convex-api";
import { notify } from "@/lib/notify";
import { useIsMobileDevice, useIsStandalone } from "@/hooks/use-pwa";
import { useInstallPrompt } from "./install-prompt-store";
import { type PushState, usePushSubscription } from "./use-push-subscription";

const STATUS_COPY: Record<PushState, string> = {
  loading: "Checking this device…",
  unsupported: "This browser can't receive push notifications.",
  "needs-install": "On iPhone and iPad, push only works from the Home Screen app.",
  unconfigured: "Push notifications aren't set up for this portal yet.",
  denied:
    "Notifications are blocked for this site. Allow them in your browser or system settings, then reload.",
  off: "Off on this device.",
  on: "On for this device.",
};

function usePushToggle() {
  const push = usePushSubscription();
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      const result = await action();
      if (result !== false) notify.success(success);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Couldn't update push notifications.");
    } finally {
      setBusy(false);
    }
  };
  return {
    ...push,
    busy,
    turnOn: () => run(push.enable, "Push notifications are on for this device."),
    turnOff: () => run(push.disable, "Push notifications are off for this device."),
  };
}

/** Account settings card: push on/off for the current device. */
export function PushNotificationSettings() {
  const { state, busy, turnOn, turnOff } = usePushToggle();
  const { openDialog } = useInstallPrompt();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DeviceMobileIcon className="size-5" />
          Push notifications
        </CardTitle>
        <CardDescription>
          Get notification-center alerts on this device, even when the portal is closed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{STATUS_COPY[state]}</p>
        {state === "off" ? (
          <Button size="sm" disabled={busy} onClick={() => void turnOn()}>
            Turn on
          </Button>
        ) : state === "on" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void turnOff()}>
            Turn off
          </Button>
        ) : state === "needs-install" ? (
          <Button size="sm" variant="outline" onClick={openDialog}>
            Add to Home Screen
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * One-line nudge at the bottom of the bell popover: turn push on, or install
 * first on iOS. Hidden once push is on, blocked, or impossible here.
 */
export function PushPrompt() {
  const { state, busy, turnOn } = usePushToggle();
  const { openDialog } = useInstallPrompt();
  const install = useQuery(api.appInstall.getAppInstallState, {});
  const standalone = useIsStandalone();
  const mobile = useIsMobileDevice();

  if (state === "off") {
    return (
      <PromptRow
        text={standalone ? "Get alerts on this device." : "Get alerts in this browser."}
        action="Turn on push"
        disabled={busy}
        onClick={() => void turnOn()}
      />
    );
  }
  if (state === "needs-install" && mobile && install && !install.installed) {
    return (
      <PromptRow text="Push needs the Home Screen app." action="Add to Home Screen" onClick={openDialog} />
    );
  }
  return null;
}

function PromptRow({
  text,
  action,
  disabled,
  onClick,
}: {
  text: string;
  action: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-3 py-2">
      <p className="text-2xs text-muted-foreground">{text}</p>
      <Button size="xs" variant="outline" disabled={disabled} onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}
